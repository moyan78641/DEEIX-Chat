import type { ChatFilePolicyDTO } from "@/shared/api/file.types";

export type UploadCategory = "image" | "pdf" | "word" | "excel" | "text" | "unknown";

const EXTENSION_TO_MIME_TYPE = {
  md: "text/markdown",
  java: "text/x-java",
  py: "text/x-script.python",
  go: "text/x-go",
  c: "text/x-c",
  cpp: "text/x-c++",
  h: "text/x-c++",
  php: "text/x-php",
  rb: "text/x-ruby",
  tex: "application/x-latext",
  ts: "text/x-typescript",
  cs: "text/x-csharp",
  rs: "text/x-rust",
  scala: "application/x-scala",
  kt: "text/x-kotlin",
  swift: "text/x-swift",
  lua: "text/x-lua",
  r: "text/x-r",
  jl: "text/x-julia",
  pl: "text/x-perl",
  sh: "text/x-shellscript",
  m: "text/x-objectivec",
  mm: "text/x-objectivec++",
  erl: "text/x-erlang",
  ex: "text/x-elixir",
  exs: "text/x-elixir",
  hs: "text/x-haskell",
  clj: "text/x-clojure",
  groovy: "text/x-groovy",
  dart: "text/x-dart",
  bash: "text/x-shellscript",
  jsx: "text/jsx",
  tsx: "text/tsx",
  hbs: "text/x-handlebars",
  handlebars: "text/x-handlebars",
  mustache: "text/x-mustache",
  ejs: "text/x-ejs",
  j2: "text/x-jinja2",
  jinja: "text/x-jinja2",
  jinja2: "text/x-jinja2",
  liquid: "text/x-liquid",
  erb: "text/x-erb",
  twig: "text/x-twig",
  pug: "text/x-pug",
  jade: "text/x-jade",
  tmpl: "text/x-tmpl",
  json: "application/json",
  yml: "application/x-yaml",
  yaml: "application/x-yaml",
  toml: "application/toml",
  ini: "text/plain",
  properties: "text/plain",
  env: "text/plain",
  xml: "text/xml",
  conf: "text/plain",
  log: "text/plain",
  txt: "text/plain",
  astro: "text/x-astro",
  avif: "image/avif",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  mpo: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
} as const;

const TEXT_FILE_EXTENSIONS = [
  "txt",
  "js",
  "ts",
  "tsx",
  "jsx",
  "py",
  "go",
  "rs",
  "java",
  "sql",
  "yaml",
  "yml",
  "toml",
  "sh",
  "html",
  "htm",
  "css",
  "ini",
  "conf",
] as const;

function resolveFileExtension(fileName: string): string {
  const normalizedName = fileName.trim().toLowerCase();
  return normalizedName.includes(".") ? normalizedName.split(".").pop() || "" : "";
}

function guessMimeTypeFromFilename(fileName: string): string {
  const extension = resolveFileExtension(fileName);
  return EXTENSION_TO_MIME_TYPE[extension as keyof typeof EXTENSION_TO_MIME_TYPE] || "";
}

function resolveEffectiveMimeType(fileName: string, browserMimeType: string): string {
  const guessedMimeType = guessMimeTypeFromFilename(fileName);
  if (guessedMimeType) {
    return guessedMimeType;
  }
  return browserMimeType.trim().toLowerCase();
}

function resolvePolicyNormalizedMime(file: File): string {
  const browserMime = file.type.trim().toLowerCase();
  const ext = resolveFileExtension(file.name);

  if (browserMime.startsWith("image/")) {
    return browserMime;
  }

  switch (ext) {
    case "pdf":
      return "application/pdf";
    case "docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case "doc":
      return "application/msword";
    case "xlsx":
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    case "xls":
      return "application/vnd.ms-excel";
    case "csv":
      return "text/csv";
    case "md":
    case "markdown":
      return "text/markdown";
    case "json":
      return "application/json";
    case "yaml":
    case "yml":
      return "text/yaml";
    case "toml":
      return "application/toml";
  }

  if (TEXT_FILE_EXTENSIONS.includes(ext as (typeof TEXT_FILE_EXTENSIONS)[number])) {
    return "text/plain";
  }

  return normalizeUploadMime(file);
}

export function normalizeUploadMime(file: File): string {
  return resolveEffectiveMimeType(file.name, file.type);
}

export function isAllowedUploadMime(file: File, policy: ChatFilePolicyDTO | null): boolean {
  if (!policy || policy.allowedMIMETypes.length === 0) {
    return true;
  }

  const allowed = new Set(policy.allowedMIMETypes.map((item) => item.trim().toLowerCase()).filter(Boolean));
  const candidates = [normalizeUploadMime(file), resolvePolicyNormalizedMime(file)].filter(Boolean);
  return candidates.some((mime) => allowed.has(mime));
}

export function inferUploadCategory(file: File): UploadCategory {
  const mime = file.type.trim().toLowerCase();
  const ext = resolveFileExtension(file.name);

  if (mime.startsWith("image/")) {
    return "image";
  }
  if (mime === "application/pdf" || ext === "pdf") {
    return "pdf";
  }
  if (mime.includes("wordprocessingml") || mime.includes("msword") || ext === "docx" || ext === "doc") {
    return "word";
  }
  if (
    mime.includes("spreadsheetml") ||
    mime.includes("ms-excel") ||
    mime === "text/csv" ||
    ext === "xlsx" ||
    ext === "xls" ||
    ext === "csv"
  ) {
    return "excel";
  }
  if (mime.startsWith("text/") || ["json", "xml", "md", "markdown", ...TEXT_FILE_EXTENSIONS].includes(ext)) {
    return "text";
  }

  return "unknown";
}

export function resolveEffectiveUploadLimit(policy: ChatFilePolicyDTO | null, category: UploadCategory): number {
  if (!policy) {
    return 0;
  }

  if (category === "image") {
    return policy.effectiveImageMaxBytes || policy.imageMaxBytes || policy.maxUploadFileBytes;
  }

  return policy.effectiveDocMaxBytes || policy.docMaxBytes || policy.maxUploadFileBytes;
}

type UploadPolicyRejectionLabels = {
  mimeNotAllowed: string;
  fullContextLimitExceeded: (limitKB: number) => string;
  sizeLimitExceeded: (limitKB: number) => string;
};

const DEFAULT_UPLOAD_POLICY_REJECTION_LABELS: UploadPolicyRejectionLabels = {
  mimeNotAllowed: "This file type is not included in the admin MIME allowlist.",
  fullContextLimitExceeded: (limitKB) => `Vector retrieval is disabled. Only small files that fit full-context injection can be uploaded, and this file exceeds the ${limitKB} KB limit.`,
  sizeLimitExceeded: (limitKB) => `This file exceeds the ${limitKB} KB limit.`,
};

export function resolveUploadPolicyRejection(
  file: File,
  policy: ChatFilePolicyDTO | null,
  labels: UploadPolicyRejectionLabels = DEFAULT_UPLOAD_POLICY_REJECTION_LABELS,
): string | null {
  if (!policy) {
    return null;
  }

  const category = inferUploadCategory(file);

  if (!isAllowedUploadMime(file, policy)) {
    return labels.mimeNotAllowed;
  }

  const limit = resolveEffectiveUploadLimit(policy, category);
  if (limit > 0 && file.size > limit) {
    const limitKB = Math.round(limit / 1024);
    if (policy.capabilityMode === "full_context_only" && category !== "image") {
      return labels.fullContextLimitExceeded(limitKB);
    }
    return labels.sizeLimitExceeded(limitKB);
  }

  return null;
}
