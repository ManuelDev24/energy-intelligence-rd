import { parseCopilotMarkdown, type MdBlock, type MdInline } from "@energyrd/core";
import Link from "next/link";
import type { ReactNode } from "react";
import { inlineLinkClass } from "@/components/ui/text-link";

// ERD-AI-CHAT: Markdown seguro. El texto del modelo nunca se inserta como HTML: se convierte en nodos con @energyrd/core y aquí en
// elementos React (que escapan todo). Solo hay enlaces a rutas internas permitidas; los demás quedan como texto.
function Inline({ nodes }: { nodes: MdInline[] }): ReactNode {
  return nodes.map((node, i) => {
    switch (node.type) {
      case "text": return <span key={i}>{node.text}</span>;
      case "code": return <code key={i} className="rounded bg-muted px-1 font-mono text-[0.85em]">{node.text}</code>;
      case "strong": return <strong key={i}><Inline nodes={node.children} /></strong>;
      case "em": return <em key={i}><Inline nodes={node.children} /></em>;
      case "link": return <Link key={i} href={node.href} className={inlineLinkClass}><Inline nodes={node.children} /></Link>;
    }
  });
}

function Block({ block }: { block: MdBlock }) {
  if (block.type === "heading") {
    const Tag = block.level === 2 ? "h3" : "h4";
    return <Tag className="mt-2 font-semibold"><Inline nodes={block.children} /></Tag>;
  }
  if (block.type === "list") {
    const Tag = block.ordered ? "ol" : "ul";
    return (
      <Tag className={block.ordered ? "list-decimal pl-5" : "list-disc pl-5"}>
        {block.items.map((item, i) => <li key={i}><Inline nodes={item} /></li>)}
      </Tag>
    );
  }
  return <p><Inline nodes={block.children} /></p>;
}

export function CopilotMarkdown({ text }: { text: string }) {
  return <div className="flex flex-col gap-2 break-words text-sm leading-relaxed">{parseCopilotMarkdown(text).map((block, i) => <Block key={i} block={block} />)}</div>;
}
