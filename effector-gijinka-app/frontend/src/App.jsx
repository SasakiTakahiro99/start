import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from './api.js'
import PedalAvatar from './PedalAvatar.jsx'
import { advance, isMaxed } from './progression.js'
import { PRESETS, playTone } from './tone.js'

const RARITY_LABEL = { NORMAL: '通常', RARE: 'レア', VINTAGE: 'ヴィンテージ', LIMITED: '限定モデル' }
const RARITY_ORDER = { NORMAL: 0, RARE: 1, VINTAGE: 2, LIMITED: 3 }

export default function App() {
  const [catalog, setCatalog] = useState(null)
  const [state, setState] = useState(null)
  const [tab, setTab] = useState('practice')
  const [toast, setToast] = useState(null)
  const [booting, setBooting] = useState(true)

  const lookups = useMemo(() => {
    if (!catalog) return null
    const charById = {}, makerById = {}, typeById = {}
    catalog.characters.forEach((c) => (charById[c.id] = c))
    catalog.makers.forEach((m) => (makerById[m.id] = m))
    catalog.effectTypes.forEach((t) => (typeById[t.id] = t))
    return { charById, makerById, typeById }
  }, [catalog])

  useEffect(() => {
    ;(async () => {
      try {
        const [cat, st] = await Promise.all([api.catalog(), api.state()])
        setCatalog(cat)
        setState(st)
      } catch (e) {
        setToast({ type: 'error', msg: '起動に失敗: ' + e.message })
      } finally {
        setBooting(false)
      }
    })()
  }, [])

  function showToast(type, msg) {
    setToast({ type, msg })
    setTimeout(() => setToast((t) => (t && t.msg === msg ? null : t)), 3500)
  }

  // 定期的にサーバーと同期(練習の進行を確定させ、他タブでも最新に保つ)
  useEffect(() => {
    if (!state || !state.initialized) return
    const id = setInterval(async () => {
      try {
        setState(await api.state())
      } catch { /* 無視: 次の周期で回復 */ }
    }, 10000)
    return () => clearInterval(id)
  }, [state && state.initialized])

  if (booting) return <div className="center">読み込み中…</div>
  if (!catalog || !state) return <div className="center">サーバーに接続できません。バックエンド(8080)が起動しているか確認してください。</div>

  if (!state.initialized) {
    return (
      <>
        <Onboarding
          catalog={catalog}
          lookups={lookups}
          onDone={(st) => { setState(st); showToast('ok', '相棒を手に入れた！練習を始めよう。') }}
          onError={(m) => showToast('error', m)}
        />
        {toast && <Toast toast={toast} />}
      </>
    )
  }

  return (
    <div className="app">
      <Header state={state} />
      <nav className="tabs">
        {[
          ['practice', '練習'],
          ['formation', '編成'],
          ['live', 'ライブ'],
          ['gacha', 'ガチャ'],
          ['zukan', '図鑑'],
          ['reincarnate', '転生'],
        ].map(([id, label]) => (
          <button key={id} className={tab === id ? 'tab active' : 'tab'} onClick={() => setTab(id)}>
            {label}
            {id === 'reincarnate' && state.canReincarnate ? <span className="dot" /> : null}
          </button>
        ))}
      </nav>

      <main className="content">
        {tab === 'practice' && <PracticeTab state={state} lookups={lookups} />}
        {tab === 'formation' && (
          <FormationTab state={state} lookups={lookups} onUpdate={setState} onToast={showToast} />
        )}
        {tab === 'live' && <LiveTab state={state} lookups={lookups} onUpdate={setState} onToast={showToast} />}
        {tab === 'gacha' && <GachaTab state={state} lookups={lookups} onUpdate={setState} onToast={showToast} />}
        {tab === 'zukan' && <ZukanTab catalog={catalog} state={state} lookups={lookups} />}
        {tab === 'reincarnate' && <ReincarnateTab state={state} onUpdate={setState} onToast={showToast} />}
      </main>

      {toast && <Toast toast={toast} />}
    </div>
  )
}

function Toast({ toast }) {
  return <div className={`toast ${toast.type}`}>{toast.msg}</div>
}

function Header({ state }) {
  return (
    <header className="header">
      <div className="brand">Pedal Nations <span className="sub">エフェクター擬人化</span></div>
      <div className="stats">
        <Stat label="所持金" value={`¥${state.money.toLocaleString()}`} />
        <Stat label="センス" value={`×${state.sense.toFixed(2)}`} />
        <Stat label="週" value={`${state.week}週目`} />
        <Stat label="無料ガチャ" value={`${state.freeGachaRemaining}回`} />
      </div>
    </header>
  )
}
function Stat({ label, value }) {
  return (<div className="stat"><span className="k">{label}</span><span className="v">{value}</span></div>)
}

// ===================== オンボーディング =====================
function Onboarding({ catalog, lookups, onDone, onError }) {
  const [maker, setMaker] = useState(null)
  const [method, setMethod] = useState(null)
  const [busy, setBusy] = useState(false)

  async function start(characterId) {
    setBusy(true)
    try {
      const st = await api.init(maker, method, characterId)
      onDone(st)
    } catch (e) {
      onError('開始に失敗: ' + e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="onboarding">
      <h1>Pedal Nations</h1>
      <p className="lead">エフェクターを擬人化した収集×放置育成ゲーム。まずは所属する「国(メーカー)」を選ぼう。</p>

      <section>
        <h2>1. メーカー(国)を選ぶ</h2>
        <div className="maker-choices">
          {catalog.makers.map((m) => (
            <button key={m.id}
              className={maker === m.id ? 'maker-card sel' : 'maker-card'}
              style={{ borderColor: m.colorHex }}
              onClick={() => { setMaker(m.id); setMethod(null) }}>
              <span className="maker-name" style={{ color: m.colorHex }}>{m.name}</span>
              <span className="maker-country">{m.country}</span>
              <span className="maker-culture">{m.culture}</span>
            </button>
          ))}
        </div>
      </section>

      {maker && (
        <section>
          <h2>2. 最初の1台の入手方法</h2>
          <div className="method-choices">
            <button className={method === 'od' ? 'method sel' : 'method'} onClick={() => setMethod('od')}>
              A: {lookups.makerById[maker].name} のODから選ぶ
            </button>
            <button className={method === 'gacha' ? 'method sel' : 'method'} onClick={() => setMethod('gacha')}>
              B: ガチャで1つ引く(ランダム)
            </button>
          </div>
        </section>
      )}

      {maker && method === 'od' && (
        <section>
          <h2>3. ODを選ぶ</h2>
          <div className="grid">
            {catalog.characters.filter((c) => c.makerId === maker && c.effectTypeId === 'od').map((c) => (
              <button key={c.id} className="pick" disabled={busy} onClick={() => start(c.id)}>
                <PedalAvatar character={c} size={90} />
                <span className="pick-name">{c.name}</span>
                <span className={`rar ${c.rarity}`}>{RARITY_LABEL[c.rarity]}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {maker && method === 'gacha' && (
        <section>
          <h2>3. ガチャで開始</h2>
          <button className="primary big" disabled={busy} onClick={() => start(null)}>
            {busy ? '抽選中…' : 'ガチャを引いて始める'}
          </button>
        </section>
      )}
    </div>
  )
}

// ===================== 練習タブ =====================
function PracticeTab({ state, lookups }) {
  const config = state.config
  // state 更新時点をクライアント基準時刻として記録し、表示を滑らかに補間する
  const base = useMemo(() => ({ t: Date.now(), owned: state.owned }), [state])
  const [, force] = useState(0)
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 200)
    return () => clearInterval(id)
  }, [])

  const elapsed = (Date.now() - base.t) / 1000
  return (
    <div>
      <div className="section-head">
        <h2>練習フェーズ</h2>
        <p className="muted">
          放置で技術が上がります(オフライン中も進行)。{config.softCap} で鈍化し、{config.hardCap} でカンスト。
        </p>
      </div>
      <div className="owned-list">
        {base.owned.map((o) => {
          const ch = lookups.charById[o.characterId]
          const disp = advance(o.techParam, elapsed, config)
          const maxed = isMaxed(disp, config)
          const pct = Math.min(100, (disp / config.hardCap) * 100)
          const softPct = (config.softCap / config.hardCap) * 100
          return (
            <div key={o.characterId} className="owned-row">
              <PedalAvatar character={ch} size={54} />
              <div className="owned-info">
                <div className="owned-top">
                  <span className="owned-name">{ch.name}</span>
                  <span className={`rar ${ch.rarity}`}>{RARITY_LABEL[ch.rarity]}</span>
                  {maxed && <span className="maxed">カンスト</span>}
                </div>
                <div className="bar">
                  <div className="bar-fill" style={{ width: pct + '%', background: ch.colorHex }} />
                  <div className="bar-soft" style={{ left: softPct + '%' }} title="ソフトキャップ" />
                </div>
                <div className="owned-num">技術 {disp.toFixed(1)} / {config.hardCap}</div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ===================== 編成タブ =====================
function FormationTab({ state, lookups, onUpdate, onToast }) {
  const [sel, setSel] = useState(state.formation)
  const [busy, setBusy] = useState(false)
  const max = state.config.formationMax

  function toggle(id) {
    setSel((cur) => {
      if (cur.includes(id)) return cur.filter((x) => x !== id)
      if (cur.length >= max) { onToast('error', `編成は最大 ${max} 体までです。`); return cur }
      return [...cur, id]
    })
  }

  async function save() {
    setBusy(true)
    try {
      const st = await api.formation(sel)
      onUpdate(st)
      onToast('ok', '編成を保存しました。')
    } catch (e) { onToast('error', e.message) } finally { setBusy(false) }
  }

  const makersInSel = new Set(sel.map((id) => lookups.charById[id]?.makerId))
  let bonusHint = 'ボーナスなし'
  if (sel.length > 0 && makersInSel.size === 1) bonusHint = '統一感ボーナス(同一メーカー)'
  else if (makersInSel.size >= 2) bonusHint = '関係性ボーナス(友好メーカー混成)'

  return (
    <div>
      <div className="section-head">
        <h2>編成</h2>
        <p className="muted">ライブに出す相棒を最大 {max} 体まで。選択中: {sel.length} 体 / 想定ボーナス: {bonusHint}</p>
      </div>
      <div className="grid">
        {state.owned.map((o) => {
          const ch = lookups.charById[o.characterId]
          const on = sel.includes(o.characterId)
          return (
            <button key={o.characterId} className={on ? 'card sel' : 'card'} onClick={() => toggle(o.characterId)}>
              <PedalAvatar character={ch} size={80} />
              <span className="card-name">{ch.name}</span>
              <span className="muted small">{lookups.makerById[ch.makerId].name}・技術{o.techParam.toFixed(0)}</span>
              {on && <span className="badge">編成中</span>}
            </button>
          )
        })}
      </div>
      <button className="primary" disabled={busy} onClick={save}>{busy ? '保存中…' : '編成を保存'}</button>
    </div>
  )
}

// ===================== ライブタブ =====================
function LiveTab({ state, lookups, onUpdate, onToast }) {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)
  const [entering, setEntering] = useState(false)

  async function hold() {
    setBusy(true); setResult(null)
    try {
      const r = await api.live()
      setEntering(true)
      setResult(r)
      onUpdate(r.state)
      setTimeout(() => setEntering(false), 1200)
    } catch (e) { onToast('error', e.message) } finally { setBusy(false) }
  }

  return (
    <div>
      <div className="section-head">
        <h2>週次ライブ</h2>
        <p className="muted">編成した相棒の 技術×センス＋固有効果 と編成ボーナスで集客し、お金を稼ぎます。</p>
      </div>

      <div className="stage">
        {state.formation.length === 0 && <p className="muted">編成が空です。先に「編成」タブで相棒を選んでください。</p>}
        <div className={`lineup ${entering ? 'enter' : ''}`}>
          {state.formation.map((id, i) => (
            <div key={id} className="lineup-item" style={{ animationDelay: `${i * 120}ms` }}>
              <PedalAvatar character={lookups.charById[id]} size={64} />
            </div>
          ))}
        </div>
      </div>

      <button className="primary big" disabled={busy || state.formation.length === 0} onClick={hold}>
        {busy ? '開催中…' : 'ライブを開催する'}
      </button>

      {result && (
        <div className="result">
          <h3>ライブ結果({result.week}週目)</h3>
          <div className="result-grid">
            <Stat label="編成スコア" value={result.totalScore.toFixed(0)} />
            <Stat label="ボーナス" value={`×${result.bonusMultiplier.toFixed(2)}`} />
            <Stat label="集客数" value={`${result.attendance.toLocaleString()}人`} />
            <Stat label="獲得" value={`¥${result.moneyGained.toLocaleString()}`} />
          </div>
          <p className="muted small">{result.bonusLabel}</p>
          <table className="breakdown">
            <thead><tr><th>相棒</th><th>技術</th><th>固有効果</th><th>スコア</th></tr></thead>
            <tbody>
              {result.breakdown.map((b) => (
                <tr key={b.characterId}>
                  <td>{lookups.charById[b.characterId]?.name}</td>
                  <td>{b.tech.toFixed(0)}</td>
                  <td>+{b.uniqueEffectFlat}</td>
                  <td>{b.score.toFixed(0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ===================== ガチャタブ =====================
function GachaTab({ state, lookups, onUpdate, onToast }) {
  const [busy, setBusy] = useState(false)
  const [pulled, setPulled] = useState(null)
  const total = Object.keys(lookups.charById).length
  const ownedCount = state.owned.length

  async function roll(paid) {
    setBusy(true); setPulled(null)
    try {
      const r = await api.gacha(paid)
      setPulled({ char: lookups.charById[r.characterId], rarity: r.rarity, free: r.free })
      onUpdate(r.state)
    } catch (e) { onToast('error', e.message) } finally { setBusy(false) }
  }

  const allCollected = ownedCount >= total
  return (
    <div>
      <div className="section-head">
        <h2>ガチャ</h2>
        <p className="muted">
          既所持は排出されません(重複なし)。コンプ状況: {ownedCount} / {total}。
          有料は ¥{state.config.gachaPaidCost.toLocaleString()}。
        </p>
      </div>

      {allCollected ? (
        <p className="muted">全キャラをコンプリートしました！</p>
      ) : (
        <div className="gacha-buttons">
          <button className="primary" disabled={busy || state.freeGachaRemaining <= 0} onClick={() => roll(false)}>
            無料で引く(残り{state.freeGachaRemaining})
          </button>
          <button className="primary" disabled={busy || state.money < state.config.gachaPaidCost} onClick={() => roll(true)}>
            ¥{state.config.gachaPaidCost.toLocaleString()} で引く
          </button>
        </div>
      )}

      {pulled && (
        <div className={`pulled rar-bg ${pulled.rarity}`}>
          <div className="pulled-pedal"><PedalAvatar character={pulled.char} size={130} /></div>
          <div className="pulled-name">{pulled.char.name}</div>
          <div className={`rar ${pulled.rarity}`}>{RARITY_LABEL[pulled.rarity]}</div>
          <div className="muted small">{lookups.makerById[pulled.char.makerId].name} / {lookups.typeById[pulled.char.effectTypeId].name}</div>
          <div className="muted small">{pulled.free ? '無料ガチャ' : '有料ガチャ'}で獲得</div>
        </div>
      )}
    </div>
  )
}

// ===================== 図鑑タブ =====================
function ZukanTab({ catalog, state, lookups }) {
  const [detail, setDetail] = useState(null)
  const ownedIds = new Set(state.owned.map((o) => o.characterId))
  const [makerFilter, setMakerFilter] = useState('all')

  const chars = [...catalog.characters].sort(
    (a, b) => a.makerId.localeCompare(b.makerId) || RARITY_ORDER[b.rarity] - RARITY_ORDER[a.rarity]
  )
  const shown = chars.filter((c) => makerFilter === 'all' || c.makerId === makerFilter)

  return (
    <div>
      <div className="section-head">
        <h2>図鑑</h2>
        <p className="muted">収集済み: {ownedIds.size} / {catalog.characters.length}</p>
      </div>
      <div className="filters">
        <button className={makerFilter === 'all' ? 'chip on' : 'chip'} onClick={() => setMakerFilter('all')}>すべて</button>
        {catalog.makers.map((m) => (
          <button key={m.id} className={makerFilter === m.id ? 'chip on' : 'chip'} onClick={() => setMakerFilter(m.id)}>{m.name}</button>
        ))}
      </div>
      <div className="grid">
        {shown.map((c) => {
          const owned = ownedIds.has(c.id)
          return (
            <button key={c.id} className={owned ? 'card' : 'card locked'} onClick={() => owned && setDetail(c)} disabled={!owned}>
              {owned ? <PedalAvatar character={c} size={80} /> : <div className="silhouette">？</div>}
              <span className="card-name">{owned ? c.name : '？？？'}</span>
              <span className={`rar ${c.rarity}`}>{RARITY_LABEL[c.rarity]}</span>
            </button>
          )
        })}
      </div>
      {detail && <CharDetail character={detail} lookups={lookups} onClose={() => setDetail(null)} />}
    </div>
  )
}

function CharDetail({ character, lookups, onClose }) {
  const presets = PRESETS[character.effectTypeId] || ['プリセット1']
  const [playing, setPlaying] = useState(-1)

  function play(i) {
    setPlaying(i)
    const dur = playTone(character.effectTypeId, i)
    setTimeout(() => setPlaying((p) => (p === i ? -1 : p)), dur * 1000)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <button className="close" onClick={onClose}>×</button>
        <div className="detail-head">
          <PedalAvatar character={character} size={120} />
          <div>
            <h3>{character.name}</h3>
            <p className="muted">
              {lookups.makerById[character.makerId].name}({lookups.makerById[character.makerId].country})
              ・{lookups.typeById[character.effectTypeId].name}
            </p>
            <span className={`rar ${character.rarity}`}>{RARITY_LABEL[character.rarity]}</span>
          </div>
        </div>

        <div className="detail-block">
          <h4>性格</h4><p>{character.personality}</p>
        </div>
        <div className="detail-block">
          <h4>固有効果(+{character.uniqueEffectFlat})</h4><p>{character.uniqueEffectDesc}</p>
        </div>
        <div className="detail-block">
          <h4>音色体験(ダミー音源)</h4>
          <div className="presets">
            {presets.map((name, i) => (
              <button key={i} className={playing === i ? 'preset on' : 'preset'} onClick={() => play(i)}>
                ▶ {name}
              </button>
            ))}
          </div>
        </div>
        <div className="detail-block">
          <h4>歴史・開発背景</h4><p className="history">{character.history}</p>
        </div>
      </div>
    </div>
  )
}

// ===================== 転生タブ =====================
function ReincarnateTab({ state, onUpdate, onToast }) {
  const [busy, setBusy] = useState(false)
  const need = state.config.reincarnateRequiredMaxed

  async function go() {
    setBusy(true)
    try {
      const r = await api.reincarnate()
      onUpdate(r.state)
      onToast('ok', `転生しました。センスが ×${r.newSense.toFixed(2)} に上昇！`)
    } catch (e) { onToast('error', e.message) } finally { setBusy(false) }
  }

  return (
    <div>
      <div className="section-head">
        <h2>転生</h2>
        <p className="muted">
          手持ちの任意の {need} 体をカンストさせると転生できます。全キャラの技術が0に戻る代わりに、
          全キャラ共通のセンスが上がります(上限 ×{state.config.senseMax.toFixed(1)})。
        </p>
      </div>
      <div className="reinc-box">
        <div className="big-num">{state.maxedCount} / {need}</div>
        <div className="muted">カンスト済みの手持ち</div>
        <div className="muted small">現在のセンス ×{state.sense.toFixed(2)} → 転生で ×{Math.min(state.config.senseMax, state.sense + state.config.senseGainPerReincarnate).toFixed(2)}</div>
        <button className="primary big" disabled={busy || !state.canReincarnate} onClick={go}>
          {state.canReincarnate ? (busy ? '転生中…' : '転生する') : `あと ${Math.max(0, need - state.maxedCount)} 体カンストで解放`}
        </button>
      </div>
    </div>
  )
}
