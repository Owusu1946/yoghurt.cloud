"use client";
import { Models } from "node-appwrite";
import Thumbnail from "@/components/Thumbnail";
import FormattedDateTime from "@/components/FormattedDateTime";
import { convertFileSize, formatDateTime } from "@/lib/utils";
import React, { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import Image from "next/image";

const ImageThumbnail = ({ file }: { file: Models.Document }) => (
  <div className="file-details-thumbnail">
    <Thumbnail type={file.type} extension={file.extension} url={file.url} />
    <div className="flex flex-col">
      <p className="subtitle-2 mb-1">{file.name}</p>
      <FormattedDateTime date={file.$createdAt} className="caption" />
    </div>
  </div>
);

const DetailRow = ({ label, value }: { label: string; value: string }) => (
  <div className="flex">
    <p className="file-details-label text-left">{label}</p>
    <p className="file-details-value text-left">{value}</p>
  </div>
);

export const FileDetails = ({ file }: { file: Models.Document }) => {
  // Debug logging for tags
  console.log('FileDetails: file tags', { fileId: file.$id, name: file.name, tags: (file as any).tags, hasTagsArray: Array.isArray((file as any).tags) });
  
  return (
    <>
      <ImageThumbnail file={file} />
      <div className="space-y-4 px-2 pt-2">
        <DetailRow label="Format:" value={file.extension} />
        <DetailRow label="Size:" value={convertFileSize(file.size)} />
        <DetailRow label="Owner:" value={file.owner.fullName} />
        <DetailRow label="Last edit:" value={formatDateTime(file.$updatedAt)} />
        <div>
          <p className="file-details-label text-left">Tags:</p>
          {Array.isArray((file as any).tags) && (file as any).tags.length > 0 ? (
            <ul className="mt-2 flex flex-wrap gap-2">
              {(file as any).tags.map((tag: string) => (
                <li key={tag} className="rounded bg-dark-400 px-2 py-[2px] caption text-light-200">
                  {tag}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 caption text-light-300">No tags yet. Use "Retag" to generate.</p>
          )}
        </div>
      </div>
    </>
  );
};

interface ShareProps {
  file: Models.Document;
  isPublic: boolean;
  selectedEmails: string[];
  onTogglePublic: (val: boolean) => void;
  onAddEmail: (email: string) => void;
  onRemove: (email: string) => void;
  publicLink: string;
}

export const ShareInput = ({ file, isPublic, selectedEmails, onTogglePublic, onAddEmail, onRemove, publicLink }: ShareProps) => {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Array<{ email: string; fullName: string }>>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!query) {
      setSuggestions([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/users/search?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        setSuggestions((data?.users || []).slice(0, 8));
      } catch {
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  const remainingSuggestions = useMemo(
    () => suggestions.filter((u) => !selectedEmails.includes(u.email)),
    [suggestions, selectedEmails],
  );

  return (
    <>
      <ImageThumbnail file={file} />

      <div className="share-wrapper">
        <div className="flex items-center justify-between">
          <p className="subtitle-2 pl-1 text-light-100">Share settings</p>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isPublic}
              onChange={(e) => onTogglePublic(e.target.checked)}
            />
            <span className="subtitle-2">Public link</span>
          </label>
        </div>

        {isPublic && (
          <div className="mt-3 flex gap-2">
            <Input readOnly value={publicLink} className="flex-1" />
            <Button onClick={() => navigator.clipboard.writeText(publicLink)}>Copy</Button>
          </div>
        )}

        <div className="mt-4">
          <Input
            type="text"
            placeholder="Type a name or email"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="share-input-field"
          />

          {loading && (
            <div className="mt-2 flex items-center gap-2 px-2 py-2 text-light-200">
              <Image src="/assets/icons/loader.svg" alt="loading" width={18} height={18} className="animate-spin" />
              <span className="caption">Searching users…</span>
            </div>
          )}

          {!!remainingSuggestions.length && (
            <ul className="mt-2 max-h-40 overflow-auto rounded-md bg-dark-400 p-2">
              {remainingSuggestions.map((u) => (
                <li
                  key={u.email}
                  className="flex cursor-pointer items-center justify-between py-1 hover:bg-dark-300 px-2 rounded"
                  onClick={() => onAddEmail(u.email)}
                >
                  <span className="subtitle-2">{u.fullName}</span>
                  <span className="caption text-light-200">{u.email}</span>
                </li>
              ))}
            </ul>
          )}

          {!loading && query && remainingSuggestions.length === 0 && (
            <div className="mt-2 rounded-md bg-dark-400 px-3 py-2 text-light-300 caption">
              No users found for “{query}”.
            </div>
          )}

          {!!selectedEmails.length && (
            <div className="pt-4">
              <div className="flex justify-between">
                <p className="subtitle-2 text-light-100">Shared with</p>
                <p className="subtitle-2 text-light-200">{selectedEmails.length} users</p>
              </div>
              <ul className="pt-2">
                {selectedEmails.map((email) => (
                  <li key={email} className="flex items-center justify-between gap-2">
                    <p className="subtitle-2">{email}</p>
                    <Button onClick={() => onRemove(email)} className="share-remove-user">
                      <Image src="/assets/icons/remove.svg" alt="Remove" width={24} height={24} className="remove-icon" />
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </>
  );
};
