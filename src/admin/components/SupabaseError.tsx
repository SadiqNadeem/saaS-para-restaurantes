type SupabaseErrorProps = {
  title?: string;
  error: unknown;
};

function getErrorMessage(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    const maybeMessage = (error as { message?: unknown }).message;
    if (typeof maybeMessage === "string") {
      return maybeMessage;
    }
  }

  return String(error);
}

export default function SupabaseError({ title, error }: SupabaseErrorProps) {
  const message = getErrorMessage(error);
  const prefix = title ? `${title}: ` : "";

  return <pre style={{ whiteSpace: "pre-wrap" }}>{`${prefix}${message}`}</pre>;
}
