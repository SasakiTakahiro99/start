// バックエンド ProgressionCalculator.advance の JS ミラー。
// サーバーが権威(実際の加算とセーブはサーバー)だが、練習画面の表示を滑らかに
// 見せるため、直近同期からの経過ぶんをクライアント側で補間表示するのに使う。
// config はサーバーの /api/state が返す値をそのまま使うのでズレない。

export function advance(current, elapsedSec, config) {
  if (elapsedSec <= 0) return Math.min(current, config.hardCap)
  let v = Math.min(current, config.hardCap)
  if (v >= config.hardCap) return config.hardCap

  let remaining = elapsedSec
  const base = config.baseRatePerSec

  if (v < config.softCap) {
    const timeToSoft = (config.softCap - v) / base
    if (remaining <= timeToSoft) return v + base * remaining
    v = config.softCap
    remaining -= timeToSoft
  }

  const slow = base * config.softCapSlowFactor
  if (slow <= 0) return v
  return Math.min(config.hardCap, v + slow * remaining)
}

export function isMaxed(tech, config) {
  return tech >= config.hardCap - 1e-6
}
