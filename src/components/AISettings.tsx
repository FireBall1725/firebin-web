// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

import { useCallback, useEffect, useState } from 'react'
import { api, type AIProviderStatus, type AISettings as AISettingsData, type AITestResult } from '../lib/api'

// OTHER is the sentinel option that switches a model picker to free text. A
// model name is never this.
const OTHER = '\u0000other'

// The assistant's settings. Every field is rendered from what the provider
// declares, so adding a provider on the server needs no change here.
export function AISettings() {
  const [data, setData] = useState<AISettingsData | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(() => {
    api.getAISettings().then(setData).catch(() => setErr('Could not load AI settings.'))
  }, [])
  useEffect(load, [load])

  if (err) return <div className="card"><p className="c-faint" style={{ padding: 20 }}>{err}</p></div>
  if (!data) return <div className="card"><p className="c-faint" style={{ padding: 20 }}>Loading…</p></div>

  const active = data.providers.find((p) => p.name === data.active_provider)
  // Selected but unusable is its own state and worth saying out loud, because
  // the server will refuse to answer and the reason is not otherwise visible.
  const activeUnconfigured = !!active && !active.enabled

  const patch = async (body: Parameters<typeof api.updateAISettings>[0]) => {
    setData(await api.updateAISettings(body))
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="card">
        <div className="card-h">
          <h2>Assistant</h2>
          <label className="flex items-center gap-2 text-sm c-dim" style={{ marginLeft: 'auto' }}>
            <input
              type="checkbox"
              checked={data.enabled}
              onChange={(e) => patch({ enabled: e.target.checked }).catch(() => setErr('Could not save.'))}
            />
            Enabled
          </label>
        </div>
        <div style={{ padding: 16 }}>
          <p className="c-dim" style={{ marginTop: 0, fontSize: 13, lineHeight: 1.5 }}>
            Ask questions about your inventory in plain language. The assistant can read
            your parts, locations and projects, and can add a part you do not own yet. It
            cannot change stock, edit an existing part, or delete anything.
          </p>
          <p className="c-dim" style={{ fontSize: 13, lineHeight: 1.5 }}>
            A hosted provider means your part names, quantities and locations are sent to
            that company as part of each question. A local provider keeps everything on
            your own hardware.
          </p>

          <label className="fieldlabel"><span>Provider</span>
            <select
              className="input"
              value={data.active_provider}
              onChange={(e) => patch({ active_provider: e.target.value }).catch(() => setErr('Could not save.'))}
            >
              <option value="">None</option>
              {data.providers.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.display_name}{p.local ? ' (local)' : ''}
                </option>
              ))}
            </select>
          </label>

          {activeUnconfigured && (
            <div className="banner" style={{ marginTop: 12, fontSize: 13 }}>
              {active?.display_name} is selected but not configured, so questions will not
              be answered. Fill in its fields below.
            </div>
          )}
          {data.enabled && !data.active_provider && (
            <div className="banner" style={{ marginTop: 12, fontSize: 13 }}>
              The assistant is on but no provider is chosen.
            </div>
          )}
        </div>
      </div>

      {data.providers.map((p) => (
        <AIProviderCard key={p.name} p={p} onSaved={load} />
      ))}
    </div>
  )
}

function AIProviderCard({ p, onSaved }: { p: AIProviderStatus; onSaved: () => void }) {
  // Start from what is saved, with secrets left blank rather than pre-filled
  // with the mask: an empty box reads as "unchanged", and a box holding ***
  // invites someone to submit it.
  const initial: Record<string, string> = {}
  for (const f of p.config_fields) initial[f.key] = f.type === 'password' ? '' : (p.config[f.key] ?? '')

  const [values, setValues] = useState(initial)
  const [msg, setMsg] = useState<string | null>(null)
  const [test, setTest] = useState<AITestResult | null>(null)
  const [busy, setBusy] = useState(false)
  // Which model fields the user has chosen to type by hand.
  const [freeText, setFreeText] = useState<Record<string, boolean>>({})
  const [models, setModels] = useState<string[] | null>(null)
  const [modelsErr, setModelsErr] = useState<string | null>(null)
  const [loadingModels, setLoadingModels] = useState(false)

  // Ask the provider what models it has. Only once it is configured: listing
  // OpenAI's models without a key fails, and reporting that as "no models could
  // be read from that host" blames the host for a key that was never entered.
  // Failure after that is silent, because the field falls back to free text.
  const loadModels = useCallback(() => {
    if (!p.can_list_models) return
    setLoadingModels(true); setModelsErr(null)
    api.listAIModels(p.name)
      .then((m) => { setModels(m.models); setModelsErr(m.error ?? null) })
      .catch(() => { setModels([]); setModelsErr('the host could not be reached') })
      .finally(() => setLoadingModels(false))
  }, [p.name, p.can_list_models])

  // Skipped when the provider has nothing to ask: listing OpenAI's models
  // without a key just fails, and reporting that as a host problem blames the
  // host for a key nobody entered.
  useEffect(() => {
    if (!p.enabled) return
    loadModels()
  }, [p.enabled, loadModels])

  const set = (k: string, v: string) => setValues((prev) => ({ ...prev, [k]: v }))

  // What the host reported, falling back to the provider's own suggestions for
  // a hosted API that will not enumerate its models.
  const fromHost = models !== null && models.length > 0
  const choices = fromHost
    ? models
    : (p.config_fields.find((f) => f.type === 'model')?.options ?? [])

  const save = async () => {
    setBusy(true); setMsg(null); setTest(null)
    try {
      // Send only what changed. Two failures otherwise: an untouched secret
      // box is empty, and sending that would read as "clear the key"; and a
      // field left blank because it is using its default would be saved as an
      // empty string, quietly replacing whatever was stored. Saving one field
      // must not rewrite the rest of the form.
      const body: Record<string, string> = {}
      for (const f of p.config_fields) {
        const v = (values[f.key] ?? '').trim()
        if (f.type === 'password') {
          if (v !== '') body[f.key] = v
          continue
        }
        if (v !== (initial[f.key] ?? '')) body[f.key] = v
      }
      if (Object.keys(body).length === 0) {
        setMsg('Nothing changed.')
        return
      }
      await api.updateAISettings({ provider: p.name, config: body })
      setValues((prev) => {
        const next = { ...prev }
        for (const f of p.config_fields) if (f.type === 'password') next[f.key] = ''
        return next
      })
      setMsg('Saved.')
      onSaved()
    } catch {
      setMsg('Could not save.')
    } finally {
      setBusy(false)
    }
  }

  const runTest = async () => {
    setBusy(true); setMsg(null); setTest(null)
    try {
      setTest(await api.testAIProvider(p.name))
    } catch {
      setMsg('Could not run the test.')
    } finally {
      setBusy(false)
    }
  }

  // Two states. Which provider answers is the selection at the top, not a
  // second switch here: a per-provider toggle only added a state where a
  // provider was chosen and still refused, which needed its own explanation on
  // screen to make sense.
  const status = !p.enabled ? 'not configured' : p.active ? 'active' : 'ready'

  return (
    <div className="card">
      <div className="card-h">
        <h2>{p.display_name}</h2>
        {p.local && <span className="pill ghost" style={{ marginLeft: 10 }}>local</span>}
        <span className={`pill ${p.enabled ? 'ok' : 'ghost'}`} style={{ marginLeft: 'auto' }}>{status}</span>
      </div>
      <div style={{ padding: 16 }}>
        <p className="c-dim" style={{ marginTop: 0, fontSize: 13, lineHeight: 1.5 }}>
          {p.description}
          {p.help_text && <> {p.help_text}</>}
          {p.help_url && (
            <> <a href={p.help_url} target="_blank" rel="noreferrer noopener">Open documentation</a>.</>
          )}
        </p>

        {p.config_fields.map((f) => {
          const listID = `ai-${p.name}-${f.key}`
          return (
            <label className="fieldlabel" key={f.key}>
              <span>{f.label}{f.required ? '' : ' (optional)'}</span>
              {f.type === 'model' && choices.length > 0 && !freeText[f.key] ? (
                // A real list, not a datalist. A datalist only appears if you
                // already suspect it is there, so the models the host reported
                // went unseen and people typed a name from memory instead.
                <select
                  className="input mono"
                  value={values[f.key] ?? ''}
                  onChange={(e) => {
                    if (e.target.value === OTHER) { setFreeText((f2) => ({ ...f2, [f.key]: true })); return }
                    set(f.key, e.target.value)
                  }}
                >
                  {/* The saved value stays selectable even when the host no
                      longer offers it, so opening this page cannot silently
                      change which model is configured. */}
                  {!choices.includes(values[f.key] ?? '') && (values[f.key] ?? '') !== '' && (
                    <option value={values[f.key]}>{values[f.key]} (not on the host)</option>
                  )}
                  {(values[f.key] ?? '') === '' && <option value="">Pick a model…</option>}
                  {choices.map((m) => <option key={m} value={m}>{m}</option>)}
                  <option value={OTHER}>Type a name…</option>
                </select>
              ) : (
                <input
                  className="input mono"
                  type={f.type === 'password' ? 'password' : 'text'}
                  value={values[f.key] ?? ''}
                  list={f.type === 'model' ? listID : undefined}
                  placeholder={
                    f.type === 'password' && p.has_secret
                      ? 'saved — leave blank to keep it'
                      : f.placeholder
                  }
                  onChange={(e) => set(f.key, e.target.value)}
                />
              )}
              {f.type === 'model' && choices.length > 0 && freeText[f.key] && (
                <datalist id={listID}>
                  {choices.map((m) => <option key={m} value={m} />)}
                </datalist>
              )}
              {f.type === 'model' && p.can_list_models && (
                <small className="c-faint" style={{ display: 'block', marginTop: 4 }}>
                  {loadingModels ? 'Reading the host…'
                    : fromHost ? `${choices.length} model${choices.length === 1 ? '' : 's'} on the host. `
                    : choices.length > 0 ? 'Suggestions only; this provider does not publish a list. '
                    : modelsErr ? `Could not read the host (${modelsErr}). Type the name instead. `
                    : 'Type the model name. '}
                  {!loadingModels && (
                    <button
                      type="button"
                      className="linklike"
                      style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', color: 'inherit', textDecoration: 'underline' }}
                      onClick={() => { setFreeText((f2) => ({ ...f2, [f.key]: false })); loadModels() }}
                    >
                      Refresh
                    </button>
                  )}
                </small>
              )}
              {f.help_text && (
                <small className="c-faint" style={{ display: 'block', marginTop: 4, lineHeight: 1.45 }}>
                  {f.help_text}
                </small>
              )}
            </label>
          )
        })}

        {p.can_list_models && p.enabled && models !== null && models.length === 0 && (
          <p className="c-faint" style={{ fontSize: 12, marginTop: 4 }}>
            No models could be read from that host. Type the model name in instead.
          </p>
        )}

        <div className="flex items-center gap-2" style={{ marginTop: 12 }}>
          <button className="btn" onClick={save} disabled={busy}>Save</button>
          <button className="btn ghost" onClick={runTest} disabled={busy || !p.enabled}>Test</button>
          {msg && <span className="c-dim text-sm">{msg}</span>}
        </div>

        {test && (
          <div className="banner" style={{ marginTop: 12, fontSize: 13 }}>
            {test.ok ? test.reply : test.error}
            {/* Test checks the provider it sits under, not the one that will
                answer. Passing here while questions fail elsewhere is otherwise
                baffling. */}
            {test.ok && !p.active && (
              <span className="c-faint"> This is not the selected provider, so questions still go elsewhere.</span>
            )}
            {test.ok && test.tokens ? (
              <span className="c-faint">
                {' '}({test.tokens} tokens{test.cost_usd ? `, $${test.cost_usd}` : ', cost unknown for this model'})
              </span>
            ) : null}
          </div>
        )}
      </div>
    </div>
  )
}
