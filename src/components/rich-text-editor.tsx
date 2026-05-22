"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";

function ToolbarBtn({
  onClick,
  active,
  title,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => {
        e.preventDefault();
        onClick();
      }}
      title={title}
      className={`rounded px-2 py-1 text-sm leading-none transition-colors ${
        active
          ? "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300"
          : "text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
      }`}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <div className="mx-1 h-4 w-px bg-gray-300 dark:bg-gray-600" />;
}

export function RichTextEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (html: string) => void;
}) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content: value || "",
    onUpdate({ editor }) {
      const text = editor.getText();
      onChange(text.trim() === "" ? "" : editor.getHTML());
    },
    editorProps: {
      attributes: {
        class:
          "prose prose-sm dark:prose-invert max-w-none min-h-[8rem] focus:outline-none px-3 py-2",
      },
    },
  });

  if (!editor) {
    return (
      <div className="min-h-[8rem] rounded border px-3 py-2 dark:border-gray-700 dark:bg-gray-900" />
    );
  }

  return (
    <div className="overflow-hidden rounded border dark:border-gray-700">
      <div className="flex flex-wrap items-center gap-0.5 border-b bg-gray-50 px-2 py-1 dark:border-gray-700 dark:bg-gray-800">
        <ToolbarBtn
          onClick={() => editor.chain().focus().toggleBold().run()}
          active={editor.isActive("bold")}
          title="Bold"
        >
          <span className="font-bold">B</span>
        </ToolbarBtn>
        <ToolbarBtn
          onClick={() => editor.chain().focus().toggleItalic().run()}
          active={editor.isActive("italic")}
          title="Italic"
        >
          <span className="font-serif italic">I</span>
        </ToolbarBtn>
        <ToolbarBtn
          onClick={() => editor.chain().focus().toggleStrike().run()}
          active={editor.isActive("strike")}
          title="Strikethrough"
        >
          <span className="line-through">S</span>
        </ToolbarBtn>
        <Divider />
        <ToolbarBtn
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          active={editor.isActive("bulletList")}
          title="Bullet list"
        >
          <svg width="15" height="13" viewBox="0 0 15 13" fill="currentColor">
            <circle cx="1.5" cy="2" r="1.5" />
            <rect x="4.5" y="1" width="10" height="2" rx="1" />
            <circle cx="1.5" cy="6.5" r="1.5" />
            <rect x="4.5" y="5.5" width="10" height="2" rx="1" />
            <circle cx="1.5" cy="11" r="1.5" />
            <rect x="4.5" y="10" width="10" height="2" rx="1" />
          </svg>
        </ToolbarBtn>
        <ToolbarBtn
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          active={editor.isActive("orderedList")}
          title="Ordered list"
        >
          <svg width="15" height="13" viewBox="0 0 15 13" fill="currentColor">
            <text x="0" y="5" fontSize="5.5" fontFamily="sans-serif">
              1.
            </text>
            <rect x="6" y="2" width="9" height="2" rx="1" />
            <text x="0" y="9.5" fontSize="5.5" fontFamily="sans-serif">
              2.
            </text>
            <rect x="6" y="6.5" width="9" height="2" rx="1" />
            <text x="0" y="14" fontSize="5.5" fontFamily="sans-serif">
              3.
            </text>
            <rect x="6" y="11" width="9" height="2" rx="1" />
          </svg>
        </ToolbarBtn>
        <Divider />
        <ToolbarBtn
          onClick={() =>
            editor
              .chain()
              .focus()
              .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
              .run()
          }
          title="Insert table"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          >
            <rect x="1" y="1" width="12" height="12" rx="1.5" />
            <line x1="5" y1="1" x2="5" y2="13" />
            <line x1="9" y1="1" x2="9" y2="13" />
            <line x1="1" y1="5" x2="13" y2="5" />
          </svg>
        </ToolbarBtn>
      </div>
      <div className="bg-white dark:bg-gray-900">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
