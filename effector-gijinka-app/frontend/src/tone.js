// 音色体験(ダミー音源)。実機音源は使わず Web Audio API で軽量にトーンを生成する。
// エフェクター種別ごとに「事前に用意した数パターン(プリセット)」を切り替えられる。
// 将来 Web Audio を拡張していく余地を残した最小実装。

let ctx = null
function ac() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)()
  if (ctx.state === 'suspended') ctx.resume()
  return ctx
}

// 種別ごとのプリセット定義(名前だけ提示し、鳴らし方は synth 側で解釈)
export const PRESETS = {
  od: ['クリーンブースト', 'クランチ', 'フルドライブ'],
  dist: ['ライト', 'ハイゲイン', 'ドンシャリ'],
  fuzz: ['ヴィンテージ', 'ゲート', 'ウォール'],
  delay: ['スラップ', 'ダブル', 'ロングリピート'],
  reverb: ['ルーム', 'ホール', 'アンビエント'],
  chorus: ['シャロー', 'ディープ', 'ステレオ'],
  flanger: ['ジェット', 'スロー', 'メタリック'],
  phaser: ['4ステージ', 'スロースイープ', 'ヴァイブ'],
  comp: ['ソフト', 'スクイーズ', 'サステイン'],
  tremolo: ['ゆるやか', 'チョップ', 'ファスト'],
}

function makeDistortionCurve(amount) {
  const n = 1024
  const curve = new Float32Array(n)
  const k = amount
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1
    curve[i] = ((3 + k) * x * 20 * Math.PI) / (Math.PI + k * Math.abs(x))
  }
  return curve
}

// 種別 + プリセット番号で1音鳴らす。戻り値: 実際に鳴った長さ(秒)
export function playTone(effectTypeId, presetIndex = 0) {
  const c = ac()
  const now = c.currentTime
  const dur = 1.1
  const baseFreq = 220 // A3 付近

  const osc = c.createOscillator()
  osc.type = effectTypeId === 'fuzz' ? 'square' : 'sawtooth'
  osc.frequency.value = baseFreq

  const preGain = c.createGain()
  preGain.gain.value = 0.25

  let node = osc
  node.connect(preGain)
  node = preGain

  // 種別ごとの味付け
  if (effectTypeId === 'od' || effectTypeId === 'dist' || effectTypeId === 'fuzz') {
    const shaper = c.createWaveShaper()
    const amt = effectTypeId === 'fuzz' ? 60 + presetIndex * 40 : 8 + presetIndex * 14
    shaper.curve = makeDistortionCurve(amt)
    node.connect(shaper)
    node = shaper
  }

  if (effectTypeId === 'tremolo') {
    const lfo = c.createOscillator()
    const lfoGain = c.createGain()
    lfo.frequency.value = 3 + presetIndex * 4
    lfoGain.gain.value = 0.4
    const trem = c.createGain()
    trem.gain.value = 0.6
    lfo.connect(lfoGain)
    lfoGain.connect(trem.gain)
    node.connect(trem)
    node = trem
    lfo.start(now)
    lfo.stop(now + dur)
  }

  if (effectTypeId === 'chorus' || effectTypeId === 'flanger' || effectTypeId === 'phaser') {
    const delay = c.createDelay()
    const lfo = c.createOscillator()
    const lfoGain = c.createGain()
    const baseDelay = effectTypeId === 'flanger' ? 0.005 : 0.02
    delay.delayTime.value = baseDelay
    lfo.frequency.value = 0.3 + presetIndex * 0.6
    lfoGain.gain.value = baseDelay * 0.8
    lfo.connect(lfoGain)
    lfoGain.connect(delay.delayTime)
    node.connect(delay)
    const mix = c.createGain()
    node.connect(mix)
    delay.connect(mix)
    node = mix
    lfo.start(now)
    lfo.stop(now + dur)
  }

  if (effectTypeId === 'delay') {
    const delay = c.createDelay()
    delay.delayTime.value = 0.12 + presetIndex * 0.12
    const fb = c.createGain()
    fb.gain.value = 0.35 + presetIndex * 0.12
    const wet = c.createGain()
    wet.gain.value = 0.5
    node.connect(delay)
    delay.connect(fb)
    fb.connect(delay)
    delay.connect(wet)
    const mix = c.createGain()
    node.connect(mix)
    wet.connect(mix)
    node = mix
  }

  if (effectTypeId === 'reverb') {
    // 簡易リバーブ: 複数の短いディレイを重ねる
    const mix = c.createGain()
    node.connect(mix)
    const taps = [0.03, 0.06, 0.09, 0.13].slice(0, 2 + presetIndex)
    taps.forEach((t) => {
      const d = c.createDelay()
      d.delayTime.value = t
      const g = c.createGain()
      g.gain.value = 0.25
      node.connect(d)
      d.connect(g)
      g.connect(mix)
    })
    node = mix
  }

  // 出力エンベロープ
  const out = c.createGain()
  out.gain.setValueAtTime(0.0001, now)
  out.gain.exponentialRampToValueAtTime(0.9, now + 0.02)
  const sustain = effectTypeId === 'comp' ? dur : dur * 0.7
  out.gain.exponentialRampToValueAtTime(0.0001, now + sustain)
  node.connect(out)
  out.connect(c.destination)

  osc.start(now)
  osc.stop(now + dur)
  return dur
}
