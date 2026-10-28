import { z } from "zod";
import { DomainError } from "./domain";

export type RoleFormValues = {
  title: string;
  employerName: string;
  places: string;
  amount: string;
  deadline: string;
};

export type CreateRoleState = {
  errors: string[];
  values: RoleFormValues;
};

const fieldErrors: Record<string, string> = {
  title: "Enter the role title.",
  employerName: "Enter the employer name.",
  guaranteeCents: "Enter a guarantee between $1 and $1,000.",
  capacity: "Choose between 1 and 100 candidates.",
  deadline: "Choose a reply deadline within 21 days.",
};

export function createRoleFailure(error: unknown, values: RoleFormValues): CreateRoleState {
  if (error instanceof z.ZodError) {
    const errors = [...new Set(error.issues
      .map((issue) => fieldErrors[String(issue.path[0])])
      .filter((message): message is string => Boolean(message)))];
    return { errors: errors.length ? errors : ["Check the role details and try again."], values: { ...values } };
  }
  if (error instanceof DomainError) {
    const message = error.message === "Choose a future deadline within 21 days."
      ? "Choose a reply deadline within 21 days."
      : error.message;
    return { errors: [message], values: { ...values } };
  }
  return { errors: ["Owed could not create this role. Try again."], values: { ...values } };
}
