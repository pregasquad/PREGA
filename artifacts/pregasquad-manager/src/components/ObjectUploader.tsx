import { useRef } from "react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

export interface UppyFileLike {
  name: string;
  size: number;
  type: string;
  data: File;
  meta: Record<string, unknown>;
  extension: string;
  id: string;
}

interface ObjectUploaderProps {
  maxNumberOfFiles?: number;
  maxFileSize?: number;
  onGetUploadParameters: (file: UppyFileLike) => Promise<{
    method: "PUT";
    url: string;
    headers?: Record<string, string>;
  }>;
  onComplete?: (result: { successful: File[]; failed: File[] }) => void;
  buttonClassName?: string;
  children: ReactNode;
}

export function ObjectUploader({
  maxNumberOfFiles = 1,
  maxFileSize = 10485760,
  onGetUploadParameters,
  onComplete,
  buttonClassName,
  children,
}: ObjectUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    let files = Array.from(e.target.files || []);
    if (!files.length) return;

    // Enforce hard file count limit (browser `multiple` only enables multi-select)
    if (files.length > maxNumberOfFiles) {
      files = files.slice(0, maxNumberOfFiles);
    }

    const successful: File[] = [];
    const failed: File[] = [];

    for (const file of files) {
      if (maxFileSize && file.size > maxFileSize) {
        failed.push(file);
        continue;
      }
      try {
        const params = await onGetUploadParameters({
          name: file.name,
          size: file.size,
          type: file.type,
          data: file,
          meta: {},
          extension: file.name.split(".").pop() || "",
          id: `${Date.now()}-${file.name}`,
        });
        const res = await fetch(params.url, {
          method: params.method,
          body: file,
          headers: {
            "Content-Type": file.type || "application/octet-stream",
            ...params.headers,
          },
        });
        if (res.ok) successful.push(file);
        else failed.push(file);
      } catch {
        failed.push(file);
      }
    }

    onComplete?.({ successful, failed });
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple={maxNumberOfFiles > 1}
        className="hidden"
        onChange={handleChange}
      />
      <Button
        type="button"
        onClick={() => inputRef.current?.click()}
        className={buttonClassName}
      >
        {children}
      </Button>
    </>
  );
}
