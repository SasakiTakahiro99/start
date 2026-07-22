// バックエンド(Spring Boot)への薄いラッパー。dev では vite プロキシ経由で /api に届く。

async function req(path, method = 'GET', body) {
  const opt = { method, headers: {} }
  if (body !== undefined) {
    opt.headers['Content-Type'] = 'application/json'
    opt.body = JSON.stringify(body)
  }
  const res = await fetch(`/api${path}`, opt)
  const text = await res.text()
  const data = text ? JSON.parse(text) : null
  if (!res.ok) {
    const msg = data && data.error ? data.error : `エラー (${res.status})`
    throw new Error(msg)
  }
  return data
}

export const api = {
  catalog: () => req('/catalog'),
  state: () => req('/state'),
  init: (maker, method, characterId) => req('/init', 'POST', { maker, method, characterId }),
  formation: (characterIds) => req('/formation', 'POST', { characterIds }),
  live: () => req('/live', 'POST'),
  gacha: (paid) => req('/gacha', 'POST', { paid }),
  reincarnate: () => req('/reincarnate', 'POST'),
  reset: () => req('/reset', 'POST'),
}
