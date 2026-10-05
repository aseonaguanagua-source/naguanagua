'use client';
import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';

export default function CopyButton({
  text,
  className = "text-slate-500 hover:text-slate-800 ml-1 p-1 bg-white rounded border border-slate-200"
}: {
  text: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={className}
      title={copied ? "¡Copiado!" : "Copiar"}
    >
      {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}
