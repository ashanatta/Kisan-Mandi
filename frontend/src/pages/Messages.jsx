import { useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import { HiChevronLeft, HiOutlinePaperAirplane } from 'react-icons/hi2'
import { Link, useParams } from 'react-router-dom'
import api from '../api/client'
import EmptyState from '../components/EmptyState'
import VerifiedBadge from '../components/trust/VerifiedBadge'
import useApi from '../hooks/useApi'
import { parseApiError } from '../utils/errors'
import { formatPrice, timeAgo } from '../utils/format'

const POLL_MS = 8000

function ConversationList({ conversations, activeId }) {
  const { t, i18n } = useTranslation()
  if (!conversations.length) {
    return <p className="p-6 text-center text-stone-500">{t('chat.empty')}</p>
  }
  return (
    <ul className="divide-y divide-stone-100">
      {conversations.map((c) => (
        <li key={c.id}>
          <Link
            to={`/messages/${c.id}`}
            className={`flex items-center gap-3 p-4 transition hover:bg-brand-50/60 ${String(c.id) === String(activeId) ? 'bg-brand-50' : ''}`}
          >
            <img src={c.product?.image} alt="" className="size-12 shrink-0 rounded-xl bg-stone-100 object-cover" />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1 truncate font-bold text-stone-900">
                {c.other_party.name} {c.other_party.is_verified && <VerifiedBadge size="icon" />}
              </p>
              <p className="truncate text-xs text-stone-500">{c.product?.title}</p>
              <p className="truncate text-sm text-stone-600">{c.last_message}</p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <span className="text-[11px] text-stone-400">{timeAgo(c.last_message_at, i18n.resolvedLanguage)}</span>
              {c.unread > 0 && <span className="latin grid min-w-5 place-items-center rounded-full bg-amber-400 px-1 text-xs font-extrabold text-brand-950">{c.unread}</span>}
            </div>
          </Link>
        </li>
      ))}
    </ul>
  )
}

function Thread({ id, onActivity }) {
  const { t, i18n } = useTranslation()
  const [data, setData] = useState(null)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const bottom = useRef(null)

  useEffect(() => {
    let alive = true
    const load = () =>
      api.get(`/conversations/${id}/messages/`).then(({ data: d }) => {
        if (alive) setData(d)
      })
    load().then(onActivity)
    const timer = setInterval(load, POLL_MS)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [id, onActivity])

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' })
  }, [data?.messages.length])

  const send = async (e) => {
    e.preventDefault()
    if (!text.trim()) return
    setBusy(true)
    try {
      const { data: msg } = await api.post(`/conversations/${id}/messages/`, { body: text })
      setData((d) => ({ ...d, messages: [...d.messages, msg] }))
      setText('')
      if (msg.was_masked) toast(t('chat.maskedToast'), { icon: '🔒', duration: 6000 })
      onActivity()
    } catch (err) {
      toast.error(parseApiError(err).message)
    } finally {
      setBusy(false)
    }
  }

  if (!data) return <div className="m-4 h-60 animate-pulse rounded-3xl bg-stone-200/60" />
  const { conversation: c, messages, contact_unlocked: unlocked } = data

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-stone-100 p-4">
        <Link to="/messages" className="grid size-10 place-items-center rounded-xl hover:bg-stone-100 md:hidden" aria-label="Back">
          <HiChevronLeft className="size-5 rtl:rotate-180" />
        </Link>
        {c.product && (
          <Link to={`/products/${c.product.id}`} className="flex min-w-0 flex-1 items-center gap-3">
            <img src={c.product.image} alt="" className="size-11 rounded-xl bg-stone-100 object-cover" />
            <div className="min-w-0">
              <p className="flex items-center gap-1 truncate font-bold text-stone-900">
                {c.other_party.name} {c.other_party.is_verified && <VerifiedBadge size="icon" />}
              </p>
              <p className="truncate text-xs text-stone-500">
                {c.product.title} · <span className="latin">{formatPrice(c.product.price)}</span>
              </p>
            </div>
          </Link>
        )}
      </header>

      {!unlocked && (
        <p className="mx-4 mt-3 rounded-2xl bg-amber-50 px-4 py-2.5 text-xs text-amber-900">🔒 {t('chat.lockedNote')}</p>
      )}

      <div className="flex-1 space-y-2 overflow-y-auto p-4">
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.mine ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] rounded-2xl px-4 py-2 ${m.mine ? 'rounded-ee-sm bg-brand-600 text-white' : 'rounded-es-sm bg-white text-stone-800 shadow-sm ring-1 ring-stone-100'}`}>
              <p className="whitespace-pre-line break-words">{m.body}</p>
              <p className={`mt-0.5 text-[10px] ${m.mine ? 'text-brand-100' : 'text-stone-400'}`}>
                {timeAgo(m.created_at, i18n.resolvedLanguage)}
                {m.was_masked && ` · 🔒 ${t('chat.maskedLabel')}`}
              </p>
            </div>
          </div>
        ))}
        <div ref={bottom} />
      </div>

      <form onSubmit={send} className="flex gap-2 border-t border-stone-100 p-3">
        <input value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} placeholder={t('chat.placeholder')} className="input" />
        <button type="submit" disabled={busy || !text.trim()} className="btn-primary px-4" aria-label={t('chat.send')}>
          <HiOutlinePaperAirplane className="size-5 rtl:rotate-180" />
        </button>
      </form>
    </div>
  )
}

export default function Messages() {
  const { id } = useParams()
  const { t } = useTranslation()
  const list = useApi('/conversations/')
  const conversations = list.data ?? []

  return (
    <div className="container-page py-6">
      <h1 className="mb-4 text-3xl font-extrabold tracking-tight text-brand-950">💬 {t('chat.title')}</h1>
      {!list.loading && conversations.length === 0 && !id ? (
        <EmptyState emoji="💬" title={t('chat.empty')} text={t('chat.emptyText')} action={<Link to="/products" className="btn-primary">{t('account.browse')}</Link>} />
      ) : (
        <div className="card grid h-[calc(100svh-14rem)] min-h-[28rem] overflow-hidden md:grid-cols-[320px_1fr]">
          <aside className={`overflow-y-auto border-e border-stone-100 ${id ? 'hidden md:block' : ''}`}>
            <ConversationList conversations={conversations} activeId={id} />
          </aside>
          <section className={`min-h-0 bg-cream/50 ${id ? '' : 'hidden md:grid md:place-items-center'}`}>
            {id ? <Thread key={id} id={id} onActivity={list.reload} /> : <p className="text-stone-500">{t('chat.pick')}</p>}
          </section>
        </div>
      )}
    </div>
  )
}
