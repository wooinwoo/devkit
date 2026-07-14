/** HTML 문서를 샌드박스 iframe 에 렌더. 스크립트는 옵션으로만 허용. */
export function HtmlView({
  content,
  allowScripts,
}: {
  content: string;
  allowScripts: boolean;
}) {
  return (
    <iframe
      title="HTML 미리보기"
      srcDoc={content}
      sandbox={allowScripts ? "allow-scripts" : ""}
      className="size-full border-0 bg-white"
    />
  );
}
