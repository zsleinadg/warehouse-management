import { useForm, UseFormProps, UseFormReturn, FieldValues } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z, ZodSchema } from "zod";

export function useZodForm<T extends FieldValues>(
  schema: ZodSchema<T>,
  options?: Omit<UseFormProps<T>, "resolver">
): UseFormReturn<T> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const resolver = zodResolver(schema as any);
  return useForm<T>({
    resolver,
    mode: "onChange",
    ...options,
  });
}

export { z };