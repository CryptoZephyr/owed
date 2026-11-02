import type { MDXComponents } from "mdx/types";
import { Children, type ComponentProps, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { Notice } from "@/components/Notice";
import { Line, Receipt } from "@/components/Receipt";
import s from "@/components/docs/docs.module.css";
import { StatesTable } from "@/components/docs/states-table";
import { slugify } from "@/content/docs/frontmatter";

function text(children: ReactNode): string {
  return Children.toArray(children).map((child) => typeof child === "string" || typeof child === "number" ? String(child) : "").join("");
}

function MdxHeading({ children, className, ...props }: ComponentPropsWithoutRef<"h2">) {
  return <h2 {...props} className={[s.mdxHeading, className].filter(Boolean).join(" ")} id={slugify(text(children))}>{children}</h2>;
}

function MdxParagraph({ className, ...props }: ComponentPropsWithoutRef<"p">) {
  return <p {...props} className={[s.mdxParagraph, className].filter(Boolean).join(" ")} />;
}

function MdxUnorderedList({ className, ...props }: ComponentPropsWithoutRef<"ul">) {
  return <ul {...props} className={[s.mdxList, className].filter(Boolean).join(" ")} />;
}

function MdxOrderedList({ className, ...props }: ComponentPropsWithoutRef<"ol">) {
  return <ol {...props} className={[s.mdxList, s.mdxOrderedList, className].filter(Boolean).join(" ")} />;
}

function MdxLink({ className, ...props }: ComponentPropsWithoutRef<"a">) {
  return <a {...props} className={[s.mdxLink, className].filter(Boolean).join(" ")} />;
}

function MdxCode({ className, ...props }: ComponentPropsWithoutRef<"code">) {
  return <code {...props} className={[s.mdxCode, className].filter(Boolean).join(" ")} />;
}

function MdxPre({ className, ...props }: ComponentPropsWithoutRef<"pre">) {
  return <pre {...props} className={[s.codeBlock, className].filter(Boolean).join(" ")} />;
}

function Callout(props: ComponentProps<typeof Notice>) {
  return <Notice {...props} />;
}

export function useMDXComponents(components: MDXComponents): MDXComponents {
  return {
    ...components,
    h2: MdxHeading,
    p: MdxParagraph,
    ul: MdxUnorderedList,
    ol: MdxOrderedList,
    a: MdxLink,
    code: MdxCode,
    pre: MdxPre,
    Receipt,
    Line,
    Callout,
    StatesTable,
  };
}
