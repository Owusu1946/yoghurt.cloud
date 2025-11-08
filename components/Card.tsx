"use client";
import { Models } from "node-appwrite";
import Link from "next/link";
import Thumbnail from "@/components/Thumbnail";
import { convertFileSize } from "@/lib/utils";
import FormattedDateTime from "@/components/FormattedDateTime";
import ActionDropdown from "@/components/ActionDropdown";
import { useEffect } from "react";

const Card = ({ file }: { file: Models.Document }) => {
  useEffect(() => {
    if (Array.isArray((file as any).tags)) {
      // Log tags for visibility in browser console
      console.log("File tags", { id: file.$id, name: file.name, tags: (file as any).tags });
    }
  }, [file]);
  return (
    <Link href={file.url} target="_blank" className="file-card">
      <div className="flex justify-between">
        <Thumbnail
          type={file.type}
          extension={file.extension}
          url={file.url}
          className="!size-20"
          imageClassName="!size-11"
        />

        <div className="flex flex-col items-end justify-between">
          <ActionDropdown file={file} />
          <p className="body-1">{convertFileSize(file.size)}</p>
        </div>
      </div>

      <div className="file-card-details">
        <p className="subtitle-2 line-clamp-1">{file.name}</p>
        <FormattedDateTime
          date={file.$createdAt}
          className="body-2 text-light-100"
        />
        <p className="caption line-clamp-1 text-light-200">
          By: {file.owner.fullName}
        </p>
        {Array.isArray((file as any).tags) && (file as any).tags.length > 0 && (
          <ul className="mt-1 flex flex-wrap gap-1">
            {(file as any).tags.slice(0, 6).map((tag: string) => (
              <li key={tag} className="rounded bg-dark-400 px-2 py-[2px] caption text-light-200">
                {tag}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Link>
  );
};
export default Card;
