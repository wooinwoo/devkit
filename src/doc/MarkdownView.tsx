import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";

/** GFM 마크다운 렌더 (테이블·체크박스·취소선·코드 하이라이트). raw HTML 은 무시 = XSS 안전. */
export function MarkdownView({ content }: { content: string }) {
  return (
    <div className="doc-md">
      <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
        {content}
      </Markdown>
    </div>
  );
}
