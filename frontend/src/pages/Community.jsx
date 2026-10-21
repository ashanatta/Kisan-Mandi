import { useCallback, useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import {
  HiChatBubbleOvalLeft,
  HiEllipsisVertical,
  HiHeart,
  HiOutlineFlag,
  HiOutlineHeart,
  HiOutlinePhoto,
  HiOutlineTrash,
  HiPaperAirplane,
  HiXMark,
} from 'react-icons/hi2'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import api from '../api/client'
import EmptyState from '../components/EmptyState'
import PageHeader from '../components/PageHeader'
import VerifiedBadge from '../components/trust/VerifiedBadge'
import { useAuth } from '../context/AuthContext'
import { parseApiError } from '../utils/errors'
import { timeAgo } from '../utils/format'

const TOPICS = { crop: '🌾', livestock: '🐄', machinery: '🚜', question: '❓', other: '📝' }
const MAX_FILES = 6

function showError(err) {
  const { message, fields } = parseApiError(err)
  toast.error(message || Object.values(fields)[0])
}

/** Send logged-out visitors to login and back here afterwards. */
function useRequireLogin() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  return (action) => (user ? action() : navigate('/login', { state: { from: location } }))
}

function Avatar({ author, size = 'size-11' }) {
  return author.avatar ? (
    <img src={author.avatar} alt="" className={`${size} shrink-0 rounded-full bg-stone-100 object-cover`} />
  ) : (
    <span className={`${size} grid shrink-0 place-items-center rounded-full bg-brand-100 font-extrabold text-brand-800`}>
      {author.name.charAt(0).toUpperCase()}
    </span>
  )
}

function Composer({ onPosted }) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [text, setText] = useState('')
  const [topic, setTopic] = useState('crop')
  const [files, setFiles] = useState([]) // [{ file, url }]
  const [progress, setProgress] = useState(null)

  // Preview URLs hold the file in memory until revoked.
  const previews = useRef(new Set())
  useEffect(() => {
    const urls = previews.current
    return () => urls.forEach((url) => URL.revokeObjectURL(url))
  }, [])
  const forget = (list) => list.forEach((f) => (URL.revokeObjectURL(f.url), previews.current.delete(f.url)))

  const addFiles = (e) => {
    const room = MAX_FILES - files.length
    const picked = Array.from(e.target.files).slice(0, room).map((file) => ({ file, url: URL.createObjectURL(file) }))
    picked.forEach((f) => previews.current.add(f.url))
    setFiles((prev) => [...prev, ...picked])
    e.target.value = ''
  }

  const removeFile = (index) => {
    forget([files[index]])
    setFiles((prev) => prev.filter((_, j) => j !== index))
  }

  const submit = async (e) => {
    e.preventDefault()
    const body = new FormData()
    body.append('text', text)
    body.append('topic', topic)
    files.forEach((f) => body.append('files', f.file))
    setProgress(0)
    try {
      const { data } = await api.post('/community/posts/', body, {
        timeout: 0, // videos can take a while on rural connections
        onUploadProgress: (ev) => ev.total && setProgress(Math.round((ev.loaded * 100) / ev.total)),
      })
      onPosted(data)
      setText('')
      forget(files)
      setFiles([])
      toast.success(t('community.posted'))
    } catch (err) {
      showError(err)
    } finally {
      setProgress(null)
    }
  }

  if (!user) {
    return (
      <div className="card flex flex-wrap items-center justify-between gap-3 p-5">
        <p className="font-semibold text-stone-700">📸 {t('community.loginToPost')}</p>
        <Link to="/login" state={{ from: { pathname: '/community' } }} className="btn-primary">{t('nav.login')}</Link>
      </div>
    )
  }

  const busy = progress !== null
  return (
    <form onSubmit={submit} className="card space-y-3 p-4 sm:p-5">
      <div className="flex gap-3">
        <Avatar author={{ name: user.first_name || user.username, avatar: user.avatar }} />
        <textarea
          rows={3}
          maxLength={2000}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t('community.placeholder')}
          className="input min-h-24 flex-1 py-3"
        />
      </div>

      {files.length > 0 && (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {files.map((f, i) => (
            <div key={f.url} className="relative aspect-square overflow-hidden rounded-xl bg-stone-100">
              {f.file.type.startsWith('video/') ? (
                <video src={f.url} muted playsInline className="size-full object-cover" />
              ) : (
                <img src={f.url} alt="" className="size-full object-cover" />
              )}
              {f.file.type.startsWith('video/') && <span className="absolute bottom-1 start-1 rounded bg-black/60 px-1 text-xs text-white">▶</span>}
              <button
                type="button"
                aria-label={t('listings.delete')}
                onClick={() => removeFile(i)}
                className="absolute end-1 top-1 grid size-7 place-items-center rounded-full bg-black/60 text-white"
              >
                <HiXMark className="size-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <label className={`btn-ghost min-h-11 cursor-pointer px-3 ${files.length >= MAX_FILES ? 'pointer-events-none opacity-40' : ''}`}>
          <HiOutlinePhoto className="size-5" /> {t('community.addMedia')}
          <input type="file" accept="image/*,video/mp4,video/webm,video/quicktime,video/3gpp" multiple onChange={addFiles} className="hidden" />
        </label>
        <select value={topic} onChange={(e) => setTopic(e.target.value)} className="input min-h-11 w-auto py-2" aria-label={t('community.topic')}>
          {Object.entries(TOPICS).map(([key, emoji]) => (
            <option key={key} value={key}>{emoji} {t(`community.topic_${key}`)}</option>
          ))}
        </select>
        <button type="submit" disabled={busy || (!text.trim() && !files.length)} className="btn-primary ms-auto min-w-28">
          {busy ? `${progress}%` : t('community.post')}
        </button>
      </div>
      {busy && (
        <div className="h-2 overflow-hidden rounded-full bg-stone-100">
          <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${progress}%` }} />
        </div>
      )}
      <p className="text-xs text-stone-500">{t('community.mediaHint')}</p>
    </form>
  )
}

function MediaGrid({ media }) {
  if (!media.length) return null
  const single = media.length === 1
  return (
    <div className={`grid gap-1 overflow-hidden rounded-2xl ${single ? '' : 'grid-cols-2'}`}>
      {media.map((m) =>
        m.kind === 'video' ? (
          <video key={m.id} src={m.file} controls preload="metadata" playsInline className={`w-full bg-black ${single ? 'max-h-[32rem]' : 'aspect-square object-cover'}`} />
        ) : (
          <a key={m.id} href={m.file} target="_blank" rel="noreferrer" className="block bg-stone-100">
            <img src={m.file} alt="" loading="lazy" className={`w-full object-cover ${single ? 'max-h-[32rem]' : 'aspect-square'}`} />
          </a>
        ),
      )}
    </div>
  )
}

function Comments({ post, onCount }) {
  const { t, i18n } = useTranslation()
  const { user } = useAuth()
  const requireLogin = useRequireLogin()
  const [comments, setComments] = useState(null)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api.get(`/community/posts/${post.id}/comments/`).then(({ data }) => setComments(data)).catch(showError)
  }, [post.id])

  const send = async (e) => {
    e.preventDefault()
    setBusy(true)
    try {
      const { data } = await api.post(`/community/posts/${post.id}/comments/`, { text })
      setComments((prev) => [...(prev ?? []), data])
      onCount(1)
      setText('')
    } catch (err) {
      showError(err)
    } finally {
      setBusy(false)
    }
  }

  const remove = async (comment) => {
    if (!window.confirm(t('community.confirmDeleteComment'))) return
    try {
      await api.delete(`/community/comments/${comment.id}/`)
      setComments((prev) => prev.filter((c) => c.id !== comment.id))
      onCount(-1)
    } catch (err) {
      showError(err)
    }
  }

  return (
    <div className="space-y-3 border-t border-stone-100 pt-3">
      {comments === null && <div className="h-10 animate-pulse rounded-xl bg-stone-100" />}
      {comments?.map((c) => (
        <div key={c.id} className="flex gap-2">
          <Avatar author={c.author} size="size-8" />
          <div className="min-w-0 flex-1 rounded-2xl bg-stone-50 px-3 py-2">
            <p className="flex items-center gap-1 text-sm font-bold text-stone-800">
              {c.author.name} {c.author.is_verified && <VerifiedBadge size="icon" className="size-4" />}
              <span className="ms-1 text-xs font-normal text-stone-400">{timeAgo(c.created_at, i18n.resolvedLanguage)}</span>
            </p>
            <p className="whitespace-pre-line break-words text-sm text-stone-700">{c.text}</p>
          </div>
          {(c.mine || post.mine) && (
            <button type="button" onClick={() => remove(c)} aria-label={t('listings.delete')} className="grid size-8 shrink-0 place-items-center rounded-lg text-stone-400 hover:bg-red-50 hover:text-red-600">
              <HiOutlineTrash className="size-4" />
            </button>
          )}
        </div>
      ))}
      {user ? (
        <form onSubmit={send} className="flex gap-2">
          <input value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} placeholder={t('community.writeComment')} className="input min-h-11 flex-1" />
          <button type="submit" disabled={busy || !text.trim()} aria-label={t('community.send')} className="btn-primary min-h-11 px-3">
            <HiPaperAirplane className="size-5 rtl:-scale-x-100" />
          </button>
        </form>
      ) : (
        <button type="button" onClick={() => requireLogin(() => {})} className="btn-outline min-h-11 w-full text-sm">{t('community.loginToComment')}</button>
      )}
    </div>
  )
}

function PostCard({ post, onChange, onDelete }) {
  const { t, i18n } = useTranslation()
  const requireLogin = useRequireLogin()
  const [showComments, setShowComments] = useState(false)
  const [menu, setMenu] = useState(false)
  const a = post.author

  const like = () =>
    requireLogin(async () => {
      // Optimistic: flip at once, then settle with the server's count.
      onChange({ ...post, liked: !post.liked, like_count: post.like_count + (post.liked ? -1 : 1) })
      try {
        const { data } = await api.post(`/community/posts/${post.id}/like/`)
        onChange({ ...post, ...data })
      } catch (err) {
        onChange(post)
        showError(err)
      }
    })

  const remove = async () => {
    setMenu(false)
    if (!window.confirm(t('community.confirmDelete'))) return
    try {
      await api.delete(`/community/posts/${post.id}/`)
      onDelete(post.id)
      toast.success(t('listings.deleted'))
    } catch (err) {
      showError(err)
    }
  }

  const report = () =>
    requireLogin(async () => {
      setMenu(false)
      const reason = window.prompt(t('community.reportReason'))
      if (reason === null) return
      try {
        await api.post(`/community/posts/${post.id}/report/`, { reason })
        toast.success(t('community.reported'))
      } catch (err) {
        showError(err)
      }
    })

  return (
    <article className="card space-y-3 p-4 sm:p-5">
      <header className="flex items-start gap-3">
        <Avatar author={a} />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1 font-bold text-stone-900">
            <span className="truncate">{a.name}</span> {a.is_verified && <VerifiedBadge size="icon" />}
          </p>
          <p className="text-xs text-stone-500">
            {a.city && `${a.city} · `}{timeAgo(post.created_at, i18n.resolvedLanguage)} · {TOPICS[post.topic]} {t(`community.topic_${post.topic}`)}
          </p>
        </div>
        <div className="relative">
          <button type="button" onClick={() => setMenu((m) => !m)} aria-label={t('nav.menu')} className="grid size-10 place-items-center rounded-xl text-stone-400 hover:bg-stone-100">
            <HiEllipsisVertical className="size-5" />
          </button>
          {menu && (
            <div className="absolute end-0 z-10 mt-1 w-44 overflow-hidden rounded-2xl border border-stone-100 bg-white shadow-lg">
              {post.mine ? (
                <button type="button" onClick={remove} className="flex w-full items-center gap-2 px-4 py-3 text-start text-sm font-semibold text-red-700 hover:bg-red-50">
                  <HiOutlineTrash className="size-4" /> {t('listings.delete')}
                </button>
              ) : (
                <button type="button" onClick={report} className="flex w-full items-center gap-2 px-4 py-3 text-start text-sm font-semibold text-stone-700 hover:bg-stone-50">
                  <HiOutlineFlag className="size-4" /> {t('community.report')}
                </button>
              )}
            </div>
          )}
        </div>
      </header>

      {post.is_hidden && <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">🙈 {t('community.hiddenNote')}</p>}
      {post.text && <p className="whitespace-pre-line break-words text-stone-800">{post.text}</p>}
      <MediaGrid media={post.media} />

      <div className="flex gap-2">
        <button type="button" onClick={like} aria-pressed={post.liked} className={`btn-ghost min-h-11 flex-1 ${post.liked ? 'text-red-600' : ''}`}>
          {post.liked ? <HiHeart className="size-5" /> : <HiOutlineHeart className="size-5" />}
          <span className="latin">{post.like_count}</span> {t('community.like')}
        </button>
        <button type="button" onClick={() => setShowComments((s) => !s)} aria-expanded={showComments} className="btn-ghost min-h-11 flex-1">
          <HiChatBubbleOvalLeft className="size-5" /> <span className="latin">{post.comment_count}</span> {t('community.comments')}
        </button>
      </div>

      {showComments && <Comments post={post} onCount={(d) => onChange({ ...post, comment_count: post.comment_count + d })} />}
    </article>
  )
}

export default function Community() {
  const { t } = useTranslation()
  const [topic, setTopic] = useState('')
  const [posts, setPosts] = useState([])
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async (nextPage, selected) => {
    setLoading(true)
    try {
      const { data } = await api.get('/community/posts/', { params: { page: nextPage, topic: selected || undefined } })
      setPosts((prev) => (nextPage === 1 ? data.results : [...prev, ...data.results]))
      setHasMore(Boolean(data.next))
      setPage(nextPage)
    } catch (err) {
      showError(err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load(1, topic)
  }, [load, topic])

  const update = (changed) => setPosts((prev) => prev.map((p) => (p.id === changed.id ? changed : p)))

  return (
    <div className="container-page max-w-2xl py-8">
      <PageHeader emoji="👨‍🌾" title={t('community.title')} subtitle={t('community.subtitle')} />

      <Composer onPosted={(post) => (!topic || post.topic === topic) && setPosts((prev) => [post, ...prev])} />

      <div className="no-scrollbar -mx-4 my-5 flex gap-2 overflow-x-auto px-4">
        {['', ...Object.keys(TOPICS)].map((key) => (
          <button
            key={key || 'all'}
            type="button"
            onClick={() => setTopic(key)}
            className={`chip ${topic === key ? 'border-brand-600 bg-brand-600 text-white' : 'border-stone-200 bg-white text-stone-700 hover:border-brand-300'}`}
          >
            {key ? `${TOPICS[key]} ${t(`community.topic_${key}`)}` : t('products.all')}
          </button>
        ))}
      </div>

      <div className="space-y-4">
        {posts.map((post) => (
          <PostCard key={post.id} post={post} onChange={update} onDelete={(id) => setPosts((prev) => prev.filter((p) => p.id !== id))} />
        ))}
        {loading && Array.from({ length: 2 }, (_, i) => <div key={i} className="h-64 animate-pulse rounded-3xl bg-stone-200/60" />)}
        {!loading && posts.length === 0 && <EmptyState emoji="🌱" title={t('community.emptyTitle')} text={t('community.emptyText')} />}
        {!loading && hasMore && (
          <button type="button" onClick={() => load(page + 1, topic)} className="btn-outline w-full">{t('community.loadMore')}</button>
        )}
      </div>
    </div>
  )
}
