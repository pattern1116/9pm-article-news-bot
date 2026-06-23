// 짧은 문단들을 길이 기준으로 묶어 하나의 덩어리(읽기/재생 단위)로 만든다.
// 누적 길이가 minChars를 넘거나 문단 수가 maxCount에 도달하면 끊는다.
export function groupParagraphs(paragraphs, { minChars = 400, maxCount = 4 } = {}) {
  const groups = [];
  let buf = [];
  let len = 0;

  for (const p of paragraphs) {
    buf.push(p);
    len += p.length;
    if (len >= minChars || buf.length >= maxCount) {
      groups.push(buf.join("\n\n"));
      buf = [];
      len = 0;
    }
  }

  if (buf.length) {
    // 마지막 자투리가 너무 짧으면 직전 그룹에 합친다.
    if (groups.length && len < minChars / 2) {
      groups[groups.length - 1] += "\n\n" + buf.join("\n\n");
    } else {
      groups.push(buf.join("\n\n"));
    }
  }

  return groups;
}
