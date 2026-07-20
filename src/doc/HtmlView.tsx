/** HTML 문서를 스크립트 권한 없는 샌드박스 iframe에 렌더. */
export function HtmlView({
  content,
}: {
  content: string;
}) {
  return (
    <iframe
      title="HTML 미리보기"
      srcDoc={content}
      sandbox=""
      className="size-full border-0 bg-bg"
    />
  );
}
