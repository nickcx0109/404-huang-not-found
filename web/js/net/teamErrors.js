/**
 * What the player reads for each server `error` code (docs/tech/NETWORK.md) and for the
 * connection problems the client finds itself. Unknown codes fall back to a generic line.
 */
const TEXT = Object.freeze({
  'no-room': '找不到這個隊伍編號，請確認後再試一次。',
  full: '這個隊伍已經滿了（最多 3 人）。',
  started: '這個隊伍已經開始遊戲，無法加入。',
  'bad-level': '伺服器沒有這個關卡。',
  'bad-message': '伺服器看不懂這個要求。',
  'start-failed': '遊戲沒能開始，請再按一次開始。',
  'server-error': '伺服器發生錯誤，請再試一次。',
  'bad-code': '隊伍編號是 4 個字元。',
  timeout: '伺服器沒有回應，請稍後再試。',
  'connection-failed': '連不上伺服器。',
  'connection-lost': '和伺服器的連線中斷了。',
  reconnecting: '連線中斷，正在重新連線…',
});

export function teamErrorText(code) {
  return TEXT[code] ?? '發生錯誤（' + String(code) + '）。';
}
