import { Bot, User, Copy, Check } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface ChatMessageProps {
  message: Message;
}

export const ChatMessage = ({ message }: ChatMessageProps) => {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === "user";

  const handleCopy = async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Simple markdown renderer for bold, lists, and tables
  const renderContent = (content: string) => {
    const lines = content.split("\n");
    const elements: JSX.Element[] = [];
    let inTable = false;
    let tableRows: string[] = [];

    lines.forEach((line, index) => {
      // Table detection
      if (line.startsWith("|")) {
        if (!inTable) {
          inTable = true;
          tableRows = [];
        }
        tableRows.push(line);
        return;
      } else if (inTable) {
        // End of table
        elements.push(renderTable(tableRows, `table-${index}`));
        inTable = false;
        tableRows = [];
      }

      // Headers
      if (line.startsWith("###")) {
        elements.push(
          <h3 key={index} className="font-semibold text-sm mt-2">
            {line.replace(/^###\s*/, "")}
          </h3>
        );
        return;
      }

      // Bold text
      let processed = line.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
      
      // List items
      if (line.startsWith("•") || line.startsWith("-") || line.startsWith("*")) {
        const content = line.replace(/^[•\-*]\s*/, "");
        elements.push(
          <div key={index} className="flex gap-2 text-sm">
            <span>•</span>
            <span dangerouslySetInnerHTML={{ __html: processed.replace(/^[•\-*]\s*/, "") }} />
          </div>
        );
        return;
      }

      // Numbered lists
      const numberedMatch = line.match(/^(\d+)\.\s+(.*)$/);
      if (numberedMatch) {
        elements.push(
          <div key={index} className="flex gap-2 text-sm">
            <span>{numberedMatch[1]}.</span>
            <span dangerouslySetInnerHTML={{ __html: numberedMatch[2].replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>") }} />
          </div>
        );
        return;
      }

      // Regular paragraph
      if (line.trim()) {
        elements.push(
          <p key={index} className="text-sm" dangerouslySetInnerHTML={{ __html: processed }} />
        );
      } else {
        elements.push(<div key={index} className="h-2" />);
      }
    });

    // Handle remaining table if content ends with table
    if (inTable && tableRows.length > 0) {
      elements.push(renderTable(tableRows, "table-end"));
    }

    return elements;
  };

  const renderTable = (rows: string[], key: string) => {
    const headers = rows[0]?.split("|").filter(Boolean).map((h) => h.trim()) || [];
    const dataRows = rows.slice(2).map((row) =>
      row.split("|").filter(Boolean).map((cell) => cell.trim())
    );

    return (
      <div key={key} className="overflow-x-auto my-2">
        <table className="min-w-full text-xs border rounded">
          <thead>
            <tr className="bg-muted">
              {headers.map((header, i) => (
                <th key={i} className="px-2 py-1 border text-left font-medium">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dataRows.map((row, i) => (
              <tr key={i}>
                {row.map((cell, j) => (
                  <td key={j} className="px-2 py-1 border">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div
      className={cn(
        "flex gap-3",
        isUser ? "flex-row-reverse" : "flex-row"
      )}
    >
      <div
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
          isUser ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary"
        )}
      >
        {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
      </div>
      <div
        className={cn(
          "group relative max-w-[80%] rounded-lg px-3 py-2",
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-foreground"
        )}
      >
        <div className="space-y-1">{renderContent(message.content)}</div>
        {!isUser && (
          <Button
            variant="ghost"
            size="icon"
            onClick={handleCopy}
            className="absolute -right-2 -top-2 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity bg-background shadow-sm"
          >
            {copied ? (
              <Check className="h-3 w-3 text-green-500" />
            ) : (
              <Copy className="h-3 w-3" />
            )}
          </Button>
        )}
      </div>
    </div>
  );
};
