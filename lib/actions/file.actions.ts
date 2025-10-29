"use server";

import { createAdminClient, createSessionClient } from "@/lib/appwrite";
import { InputFile } from "node-appwrite/file";
import { appwriteConfig } from "@/lib/appwrite/config";
import { ID, Models, Query } from "node-appwrite";
import { constructFileUrl, getFileType, parseStringify } from "@/lib/utils";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/actions/user.actions";
import {
  listUserFiles,
  aggregateTotalsForUser,
} from "@/lib/mongo/files";
import { getCollection } from "@/lib/mongo/client";
import { ObjectId } from "mongodb";
import { uploadToGridFS, deleteFromGridFS } from "@/lib/mongo/storage";

const handleError = (error: unknown, message: string) => {
  console.log(error, message);
  throw error;
};

// Temporary guard while migrating away from Appwrite
const appwriteEnabled = () =>
  !!(
    process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT &&
    process.env.NEXT_PUBLIC_APPWRITE_PROJECT &&
    process.env.NEXT_PUBLIC_APPWRITE_DATABASE &&
    process.env.NEXT_PUBLIC_APPWRITE_FILES_COLLECTION &&
    process.env.NEXT_PUBLIC_APPWRITE_BUCKET
  );

export const uploadFile = async ({
  file,
  ownerId,
  accountId,
  path,
}: UploadFileProps) => {
  if (!appwriteEnabled()) {
    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      const gridId = await uploadToGridFS(buffer, file.name, (file as any).type);
      const col = await getCollection("files");

      const fileDocument = {
        type: getFileType(file.name).type,
        name: file.name,
        url: `/api/files/${gridId}`,
        extension: getFileType(file.name).extension,
        size: file.size,
        owner: new ObjectId(ownerId),
        accountId,
        users: [],
        bucketFileId: gridId,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any;

      const result = await col.insertOne(fileDocument);
      const created = {
        $id: result.insertedId.toString(),
        $createdAt: fileDocument.createdAt.toISOString(),
        $updatedAt: fileDocument.updatedAt.toISOString(),
        ...fileDocument,
        owner: { fullName: (await getCurrentUser())?.fullName || "" },
      } as any;

      revalidatePath(path);
      return parseStringify(created);
    } catch (e) {
      handleError(e, "Failed to upload file");
    }
  }
  const { storage, databases } = await createAdminClient();

  try {
    const inputFile = InputFile.fromBuffer(file, file.name);

    const bucketFile = await storage.createFile(
      appwriteConfig.bucketId,
      ID.unique(),
      inputFile,
    );

    const fileDocument = {
      type: getFileType(bucketFile.name).type,
      name: bucketFile.name,
      url: constructFileUrl(bucketFile.$id),
      extension: getFileType(bucketFile.name).extension,
      size: bucketFile.sizeOriginal,
      owner: ownerId,
      accountId,
      users: [],
      bucketFileId: bucketFile.$id,
    };

    const newFile = await databases
      .createDocument(
        appwriteConfig.databaseId,
        appwriteConfig.filesCollectionId,
        ID.unique(),
        fileDocument,
      )
      .catch(async (error: unknown) => {
        await storage.deleteFile(appwriteConfig.bucketId, bucketFile.$id);
        handleError(error, "Failed to create file document");
      });

    revalidatePath(path);
    return parseStringify(newFile);
  } catch (error) {
    handleError(error, "Failed to upload file");
  }
};

const createQueries = (
  currentUser: Models.Document,
  types: string[],
  searchText: string,
  sort: string,
  limit?: number,
) => {
  const queries = [
    Query.or([
      Query.equal("owner", [currentUser.$id]),
      Query.contains("users", [currentUser.email]),
    ]),
  ];

  if (types.length > 0) queries.push(Query.equal("type", types));
  if (searchText) queries.push(Query.contains("name", searchText));
  if (limit) queries.push(Query.limit(limit));

  if (sort) {
    const [sortBy, orderBy] = sort.split("-");

    queries.push(
      orderBy === "asc" ? Query.orderAsc(sortBy) : Query.orderDesc(sortBy),
    );
  }

  return queries;
};

export const getFiles = async ({
  types = [],
  searchText = "",
  sort = "$createdAt-desc",
  limit,
}: GetFilesProps) => {
  if (!appwriteEnabled()) {
    try {
      const currentUser = await getCurrentUser();
      if (!currentUser) return parseStringify({ total: 0, documents: [] });

      const { total, docs } = await listUserFiles({
        ownerId: currentUser.$id,
        ownerEmail: currentUser.email,
        types,
        searchText,
        sort,
        limit,
      });

      const documents = docs.map((d: any) => ({
        $id: d._id.toString(),
        $createdAt: d.createdAt?.toISOString?.() || new Date().toISOString(),
        $updatedAt: d.updatedAt?.toISOString?.() || new Date().toISOString(),
        type: d.type,
        name: d.name,
        url: d.url,
        extension: d.extension,
        size: d.size,
        owner: { fullName: currentUser.fullName },
        accountId: d.accountId || currentUser.accountId,
        users: d.users || [],
        bucketFileId: d.bucketFileId,
      }));

      return parseStringify({ total, documents });
    } catch (e) {
      console.log("files.getFiles.mongo.error", e);
      return parseStringify({ total: 0, documents: [] });
    }
  }
  const { databases } = await createAdminClient();

  try {
    const currentUser = await getCurrentUser();

    if (!currentUser) throw new Error("User not found");

    const queries = createQueries(currentUser, types, searchText, sort, limit);

    const files = await databases.listDocuments(
      appwriteConfig.databaseId,
      appwriteConfig.filesCollectionId,
      queries,
    );

    console.log({ files });
    return parseStringify(files);
  } catch (error) {
    handleError(error, "Failed to get files");
  }
};

export const renameFile = async ({
  fileId,
  name,
  extension,
  path,
}: RenameFileProps) => {
  if (!appwriteEnabled()) {
    try {
      const col = await getCollection("files");
      const newName = `${name}.${extension}`;
      await col.updateOne(
        { _id: new ObjectId(fileId) },
        { $set: { name: newName, updatedAt: new Date() } },
      );
      revalidatePath(path);
      return parseStringify({ status: "success" });
    } catch (e) {
      handleError(e, "Failed to rename file");
    }
  }
  const { databases } = await createAdminClient();

  try {
    const newName = `${name}.${extension}`;
    const updatedFile = await databases.updateDocument(
      appwriteConfig.databaseId,
      appwriteConfig.filesCollectionId,
      fileId,
      {
        name: newName,
      },
    );

    revalidatePath(path);
    return parseStringify(updatedFile);
  } catch (error) {
    handleError(error, "Failed to rename file");
  }
};

export const updateFileUsers = async ({
  fileId,
  emails,
  path,
}: UpdateFileUsersProps) => {
  if (!appwriteEnabled()) {
    try {
      const col = await getCollection("files");
      await col.updateOne(
        { _id: new ObjectId(fileId) },
        { $set: { users: emails, updatedAt: new Date() } },
      );
      revalidatePath(path);
      return parseStringify({ status: "success" });
    } catch (e) {
      handleError(e, "Failed to update file users");
    }
  }
  const { databases } = await createAdminClient();

  try {
    const updatedFile = await databases.updateDocument(
      appwriteConfig.databaseId,
      appwriteConfig.filesCollectionId,
      fileId,
      {
        users: emails,
      },
    );

    revalidatePath(path);
    return parseStringify(updatedFile);
  } catch (error) {
    handleError(error, "Failed to rename file");
  }
};

export const deleteFile = async ({
  fileId,
  bucketFileId,
  path,
}: DeleteFileProps) => {
  if (!appwriteEnabled()) {
    try {
      const col = await getCollection("files");
      if (bucketFileId) {
        try {
          await deleteFromGridFS(bucketFileId);
        } catch (e) {
          console.log("files.deleteFile.gridfs.warn", e);
        }
      }
      await col.deleteOne({ _id: new ObjectId(fileId) });
      revalidatePath(path);
      return parseStringify({ status: "success" });
    } catch (e) {
      handleError(e, "Failed to delete file");
    }
  }
  const { databases, storage } = await createAdminClient();

  try {
    const deletedFile = await databases.deleteDocument(
      appwriteConfig.databaseId,
      appwriteConfig.filesCollectionId,
      fileId,
    );

    if (deletedFile) {
      await storage.deleteFile(appwriteConfig.bucketId, bucketFileId);
    }

    revalidatePath(path);
    return parseStringify({ status: "success" });
  } catch (error) {
    handleError(error, "Failed to rename file");
  }
};

// ============================== TOTAL FILE SPACE USED
export async function getTotalSpaceUsed() {
  try {
    if (!appwriteEnabled()) {
      const currentUser = await getCurrentUser();
      if (!currentUser)
        return parseStringify({
          image: { size: 0, latestDate: "" },
          document: { size: 0, latestDate: "" },
          video: { size: 0, latestDate: "" },
          audio: { size: 0, latestDate: "" },
          other: { size: 0, latestDate: "" },
          used: 0,
          all: 2 * 1024 * 1024 * 1024,
        });
      const totals = await aggregateTotalsForUser(currentUser.$id, currentUser.email);
      return parseStringify(totals);
    }
    const { databases } = await createSessionClient();
    const currentUser = await getCurrentUser();
    if (!currentUser) throw new Error("User is not authenticated.");

    const files = await databases.listDocuments(
      appwriteConfig.databaseId,
      appwriteConfig.filesCollectionId,
      [Query.equal("owner", [currentUser.$id])],
    );

    const totalSpace = {
      image: { size: 0, latestDate: "" },
      document: { size: 0, latestDate: "" },
      video: { size: 0, latestDate: "" },
      audio: { size: 0, latestDate: "" },
      other: { size: 0, latestDate: "" },
      used: 0,
      all: 2 * 1024 * 1024 * 1024 /* 2GB available bucket storage */,
    };

    files.documents.forEach((file) => {
      const fileType = file.type as FileType;
      totalSpace[fileType].size += file.size;
      totalSpace.used += file.size;

      if (
        !totalSpace[fileType].latestDate ||
        new Date(file.$updatedAt) > new Date(totalSpace[fileType].latestDate)
      ) {
        totalSpace[fileType].latestDate = file.$updatedAt;
      }
    });

    return parseStringify(totalSpace);
  } catch (error) {
    handleError(error, "Error calculating total space used:, ");
  }
}
