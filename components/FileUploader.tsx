"use client";

import React, { useCallback, useState } from "react";

import { useDropzone } from "react-dropzone";
import { Button } from "@/components/ui/button";
import { cn, convertFileToUrl, getFileType } from "@/lib/utils";
import Image from "next/image";
import Thumbnail from "@/components/Thumbnail";
import { MAX_FILE_SIZE } from "@/constants";
import { useToast } from "@/hooks/use-toast";
import { uploadFile } from "@/lib/actions/file.actions";
import { usePathname, useRouter } from "next/navigation";

interface Props {
  ownerId: string;
  accountId: string;
  className?: string;
}

const FileUploader = ({ ownerId, accountId, className }: Props) => {
  const path = usePathname();
  const router = useRouter();
  const { toast } = useToast();
  const [files, setFiles] = useState<{ file: File; progress: number }[]>([]);

  const uploadWithProgress = (
    file: File,
    fields: { ownerId: string; accountId: string; path: string },
  ) => {
    return new Promise<any>((resolve, reject) => {
      const form = new FormData();
      form.append("file", file);
      form.append("ownerId", fields.ownerId);
      form.append("accountId", fields.accountId);
      form.append("path", fields.path);

      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/upload");
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const percent = Math.round((e.loaded / e.total) * 100);
          setFiles((prev) =>
            prev.map((it) =>
              it.file.name === file.name ? { ...it, progress: percent } : it,
            ),
          );
        }
      };
      xhr.onreadystatechange = () => {
        if (xhr.readyState === XMLHttpRequest.DONE) {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const json = JSON.parse(xhr.responseText || "{}");
              resolve(json);
            } catch {
              resolve(true);
            }
          } else {
            reject(new Error("Upload failed"));
          }
        }
      };
      xhr.onerror = () => reject(new Error("Network error"));
      xhr.send(form);
    });
  };

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      setFiles(acceptedFiles.map((f) => ({ file: f, progress: 0 })));

      const uploadPromises = acceptedFiles.map(async (file) => {
        if (file.size > MAX_FILE_SIZE) {
          setFiles((prevFiles) =>
            prevFiles.filter((f) => f.file.name !== file.name),
          );

          return toast({
            description: (
              <p className="body-2 text-white">
                <span className="font-semibold">{file.name}</span> is too large.
                Max file size is 50MB.
              </p>
            ),
            className: "error-toast",
          });
        }

        try {
          const uploaded: any = await uploadWithProgress(file, { ownerId, accountId, path });
          setFiles((prevFiles) =>
            prevFiles.filter((f) => f.file.name !== file.name),
          );
          // Pre-warm the file URL so it renders instantly after refresh
          if (uploaded && uploaded.url) {
            try {
              await fetch(uploaded.url, { cache: "no-store" });
            } catch {}
          }
          // Re-fetch server data so the new file shows instantly
          router.refresh();
        } catch (e) {
          toast({
            description: (
              <p className="body-2 text-white">
                Failed to upload <span className="font-semibold">{file.name}</span>
              </p>
            ),
            className: "error-toast",
          });
          setFiles((prevFiles) =>
            prevFiles.filter((f) => f.file.name !== file.name),
          );
        }
      });

      await Promise.all(uploadPromises);
    },
    [ownerId, accountId, path],
  );

  const { getRootProps, getInputProps } = useDropzone({ onDrop });

  const handleRemoveFile = (
    e: React.MouseEvent<HTMLImageElement, MouseEvent>,
    fileName: string,
  ) => {
    e.stopPropagation();
    setFiles((prevFiles) =>
      prevFiles.filter((item) => item.file.name !== fileName),
    );
  };

  return (
    <div {...getRootProps()} className="cursor-pointer">
      <input {...getInputProps()} />
      <Button type="button" className={cn("uploader-button", className)}>
        <Image
          src="/assets/icons/upload.svg"
          alt="upload"
          width={24}
          height={24}
        />{" "}
        <p>Upload</p>
      </Button>
      {files.length > 0 && (
        <ul className="uploader-preview-list">
          <h4 className="h4 text-light-100">Uploading</h4>

          {files.map(({ file, progress }, index) => {
            const { type, extension } = getFileType(file.name);

            return (
              <li
                key={`${file.name}-${index}`}
                className="uploader-preview-item"
              >
                <div className="flex items-center gap-3">
                  <Thumbnail
                    type={type}
                    extension={extension}
                    url={convertFileToUrl(file)}
                  />

                  <div className="preview-item-name">
                    {file.name}
                    <div className="mt-2 w-full rounded-full bg-light-300/60">
                      <div
                        className="h-2 rounded-full bg-brand"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>
                </div>

                <Image
                  src="/assets/icons/remove.svg"
                  width={24}
                  height={24}
                  alt="Remove"
                  onClick={(e) => handleRemoveFile(e, file.name)}
                />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default FileUploader;
