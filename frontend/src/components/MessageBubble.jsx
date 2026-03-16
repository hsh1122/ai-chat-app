import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

function formatMarkdown(content) {
  return content?.trim().length ? content : "...";
}


function formatMessageTime(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function buildRule(type, pattern) {
  const flags = pattern.flags.replace(/g/g, "");
  return {
    type,
    pattern,
    matcher: new RegExp(`^(?:${pattern.source})$`, flags),
  };
}

function getLanguageRules(language) {
  const common = [
    buildRule("comment", /\/\/[^\n]*/),
    buildRule("comment", /#[^\n]*/),
    buildRule("comment", /\/\*[\s\S]*?\*\//),
    buildRule("string", /"(?:\\.|[^"\\])*"/),
    buildRule("string", /'(?:\\.|[^'\\])*'/),
    buildRule("string", /`(?:\\.|[^`\\])*`/),
    buildRule("number", /\b\d+(?:\.\d+)?\b/),
  ];

  const byLanguage = {
    javascript: [
      buildRule("keyword", /\b(?:const|let|var|function|return|if|else|for|while|switch|case|break|continue|new|class|extends|import|from|export|async|await|try|catch|throw|finally|null|undefined|true|false)\b/),
      ...common,
    ],
    typescript: [
      buildRule("keyword", /\b(?:const|let|var|function|return|if|else|for|while|switch|case|break|continue|new|class|extends|implements|interface|type|enum|import|from|export|async|await|public|private|protected|readonly|try|catch|throw|finally|null|undefined|true|false)\b/),
      ...common,
    ],
    python: [
      buildRule("keyword", /\b(?:def|class|return|if|elif|else|for|while|break|continue|import|from|as|with|try|except|finally|raise|pass|yield|lambda|True|False|None|and|or|not|in|is)\b/),
      ...common,
    ],
    json: [
      buildRule("keyword", /\b(?:true|false|null)\b/),
      buildRule("string", /"(?:\\.|[^"\\])*"(?=\s*:)/),
      ...common,
    ],
    sql: [
      buildRule("keyword", /\b(?:SELECT|FROM|WHERE|INSERT|INTO|VALUES|UPDATE|SET|DELETE|JOIN|LEFT|RIGHT|INNER|OUTER|ON|GROUP|BY|ORDER|LIMIT|AND|OR|NOT|AS|DISTINCT|COUNT|SUM|AVG|MIN|MAX)\b/i),
      ...common,
    ],
    bash: [
      buildRule("keyword", /\b(?:if|then|else|fi|for|in|do|done|while|case|esac|function|export|sudo|echo|cat|grep|awk|sed|cd|ls|pwd)\b/),
      ...common,
    ],
  };

  return byLanguage[language] || common;
}

function buildUnionRegex(rules) {
  const source = rules.map((rule) => `(${rule.pattern.source})`).join("|");
  return new RegExp(source, "gm");
}

function highlightCode(source, language) {
  const rules = getLanguageRules(language);
  const union = buildUnionRegex(rules);
  const tokens = [];
  let lastIndex = 0;
  let match = union.exec(source);

  while (match) {
    const start = match.index;
    const value = match[0];

    if (start > lastIndex) {
      tokens.push({ type: "plain", text: source.slice(lastIndex, start) });
    }

    let type = "plain";
    for (const rule of rules) {
      if (rule.matcher.test(value)) {
        type = rule.type;
        break;
      }
    }

    tokens.push({ type, text: value });
    lastIndex = start + value.length;
    match = union.exec(source);
  }

  if (lastIndex < source.length) {
    tokens.push({ type: "plain", text: source.slice(lastIndex) });
  }

  return tokens;
}

function MarkdownContent({ content }) {
  const components = {
    pre({ children }) {
      return <>{children}</>;
    },
    code({ inline, className, children }) {
      const value = String(children).replace(/\n$/, "");

      if (inline) {
        return <code className="inline-code">{value}</code>;
      }

      const language = className?.replace("language-", "").toLowerCase() || "text";
      const tokens = highlightCode(value, language);

      return (
        <pre className="code-block" data-lang={language}>
          <div className="code-header">
            <span>{language}</span>
          </div>
          <code className={`code-content language-${language}`}>
            {tokens.map((token, index) => (
              <span key={`${language}-${index}`} className={`token ${token.type}`}>
                {token.text}
              </span>
            ))}
          </code>
        </pre>
      );
    },
  };

  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {formatMarkdown(content)}
    </ReactMarkdown>
  );
}

export default function MessageBubble({ message, showRegenerate, onRegenerate }) {
  const isAssistant = message.role === "assistant";
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) {
      return undefined;
    }

    const timeout = window.setTimeout(() => setCopied(false), 1400);
    return () => window.clearTimeout(timeout);
  }, [copied]);

  const copyLabel = useMemo(() => (copied ? "Copied" : "Copy"), [copied]);
  const timeLabel = useMemo(() => formatMessageTime(message.created_at), [message.created_at]);

  const handleCopy = async () => {
    if (!isAssistant || !message.content) {
      return;
    }

    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
    } catch {
      // Clipboard errors are non-fatal for chat UX.
    }
  };

  const handleRegenerate = () => {
    if (!showRegenerate || !onRegenerate) {
      return;
    }

    onRegenerate();
  };

  return (
    <div className={`message-row ${isAssistant ? "assistant" : "user"}`}>
      <div className="message-bubble">
        <div className="message-role">
          {isAssistant ? "Assistant" : "You"}
          {timeLabel ? ` ? ${timeLabel}` : ""}
        </div>
        {isAssistant ? (
          <div className="message-markdown">
            <MarkdownContent content={message.content} />
          </div>
        ) : (
          <p className="message-text">{message.content}</p>
        )}

        {isAssistant && (
          <div className="message-actions">
            <button
              type="button"
              className={`copy-btn ${copied ? "copied" : ""}`}
              onClick={handleCopy}
              aria-live="polite"
            >
              {copyLabel}
            </button>
            {showRegenerate && (
              <button type="button" className="copy-btn" onClick={handleRegenerate}>
                Regenerate
              </button>
            )}
            {message.isStreaming && (
              <span className="streaming-indicator">
                <span className="dot" />
                <span className="dot" />
                <span className="dot" />
                Streaming
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
