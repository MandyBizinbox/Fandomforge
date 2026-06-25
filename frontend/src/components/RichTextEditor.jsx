import React, { useEffect, useRef } from "react";

const toolbarButtons = [
  ["bold", "Bold"],
  ["italic", "Italic"],
  ["underline", "Underline"],
  ["insertUnorderedList", "Bullet List"],
  ["insertOrderedList", "Numbered List"],
];

function runCommand(command, value = null) {
  document.execCommand(command, false, value);
}

export default function RichTextEditor({ value = "", onChange, placeholder = "Write content…" }) {
  const editorRef = useRef(null);
  const lastHtmlRef = useRef(value || "");

  useEffect(() => {
    const node = editorRef.current;
    if (!node) return;
    const next = value || "";
    if (next !== lastHtmlRef.current && next !== node.innerHTML) {
      node.innerHTML = next;
      lastHtmlRef.current = next;
    }
  }, [value]);

  const emit = () => {
    const html = editorRef.current?.innerHTML || "";
    lastHtmlRef.current = html;
    onChange?.(html);
  };

  const applyBlock = (tag) => {
    runCommand("formatBlock", tag);
    emit();
  };

  const addLink = () => {
    const url = window.prompt("Enter the link URL");
    if (!url) return;
    runCommand("createLink", url);
    emit();
  };

  return (
    <div className="border border-white/15 bg-black">
      <div className="flex flex-wrap gap-2 border-b border-white/10 p-2 bg-white/[0.03]">
        <select
          className="bg-black border border-white/15 px-2 py-1 text-xs uppercase tracking-widest"
          onChange={(e) => {
            if (e.target.value) applyBlock(e.target.value);
            e.target.value = "";
          }}
          defaultValue=""
        >
          <option value="" disabled>Text style</option>
          <option value="p">Paragraph</option>
          <option value="h2">Heading</option>
          <option value="h3">Subheading</option>
        </select>
        {toolbarButtons.map(([command, label]) => (
          <button
            key={command}
            type="button"
            onClick={() => { runCommand(command); emit(); }}
            className="border border-white/15 px-3 py-1 text-xs uppercase tracking-widest hover:border-[#FF3B30]"
          >
            {label}
          </button>
        ))}
        <button type="button" onClick={addLink} className="border border-white/15 px-3 py-1 text-xs uppercase tracking-widest hover:border-[#FF3B30]">Link</button>
        <button type="button" onClick={() => { runCommand("removeFormat"); emit(); }} className="border border-white/15 px-3 py-1 text-xs uppercase tracking-widest hover:border-[#FF3B30]">Clear</button>
      </div>
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={emit}
        onBlur={emit}
        data-placeholder={placeholder}
        className="min-h-[160px] p-4 text-sm text-zinc-200 outline-none prose-invert max-w-none rich-text-editor"
        style={{ whiteSpace: "normal" }}
      />
    </div>
  );
}
