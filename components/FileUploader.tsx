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
  const [files, setFiles] = useState<Array<{ file: File; progress: number; total?: number }>>([]);

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
      
      // Track upload start
      xhr.upload.onloadstart = () => {
        console.log(`Upload started: ${file.name}`);
        setFiles((prev) =>
          prev.map((it) =>
            it.file.name === file.name ? { ...it, progress: 1 } : it,
          ),
        );
      };
      
      // Track progress - works for all file types (images, videos, documents, etc.)
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const percent = Math.min(100, Math.max(0, (e.loaded / e.total) * 100));
          console.log(`Upload progress ${file.name}: ${percent.toFixed(1)}% (${e.loaded}/${e.total})`);
          setFiles((prev) =>
            prev.map((it) =>
              it.file.name === file.name
                ? { ...it, progress: Number(percent.toFixed(1)), total: e.total }
                : it,
            ),
          );
        } else {
          console.log(`Upload progress ${file.name}: length not computable`);
        }
      };
      xhr.upload.onload = () => {
        console.log(`Upload completed: ${file.name}`);
        setFiles((prev) =>
          prev.map((it) =>
            it.file.name === file.name
              ? { ...it, progress: 100 }
              : it,
          ),
        );
      };
      
      xhr.onreadystatechange = () => {
        if (xhr.readyState === XMLHttpRequest.DONE) {
          console.log(`Server response for ${file.name}: status ${xhr.status}`);
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const json = JSON.parse(xhr.responseText || "{}");
              resolve(json);
            } catch {
              resolve(true);
            }
          } else {
            const body = (xhr.responseText || '').slice(0, 200);
            console.error(`Upload failed for ${file.name}: ${xhr.status} ${body}`);
            reject(new Error(`Upload failed (${xhr.status}) ${body}`));
          }
        }
      };
      xhr.onerror = () => reject(new Error("Network error"));
      xhr.timeout = 5 * 60 * 1000; // 5 minutes
      xhr.ontimeout = () => reject(new Error("Upload timed out"));
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
          
          // Trigger refresh immediately (don't await)
          router.refresh();
          
          // Pre-warm file URL in background
          if (uploaded && uploaded.url) {
            fetch(uploaded.url, { cache: "no-store" }).catch(() => {});
          }
          
          // Keep progress at 100% briefly for visual confirmation, then remove
          await new Promise(resolve => setTimeout(resolve, 300));
          setFiles((prevFiles) =>
            prevFiles.filter((f) => f.file.name !== file.name),
          );
        } catch (e: any) {
          const message = String(e?.message || e || 'Upload failed');
          const tooLarge = /413/.test(message);
          toast({
            description: (
              <p className="body-2 text-white">
                Failed to upload <span className="font-semibold">{file.name}</span>
                {tooLarge ? ' — request too large for server. Try smaller file or use direct upload.' : ''}
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
                    <div className="mt-2 w-full flex items-center gap-3">
                      <div
                        className="flex-1 rounded-full bg-light-300/60"
                        role="progressbar"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={Number.isFinite(progress) ? Number(progress.toFixed(0)) : 0}
                        aria-label={`Uploading ${file.name}`}
                      >
                        <div
                          className="h-2 rounded-full bg-brand transition-all duration-300 ease-out"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                      <span className="text-xs font-medium text-light-100 w-14 text-right">{Number.isFinite(progress) ? `${Math.round(progress)}%` : "0%"}</span>
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
