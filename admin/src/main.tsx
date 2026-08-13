import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Activity, Bell, Car, ChevronDown, CircleDollarSign, ClipboardCheck, FileCheck2,
  LayoutDashboard, LogOut, Menu, MessageSquareText, RefreshCw, Search, ShieldCheck,
  Store, TicketPercent, TrendingUp, Users, WalletCards
} from 'lucide-react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import './styles.css';
import './extra.css';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';
type Health = { name: string; status: string; latency_ms?: number; message?: string };
type Dashboard = {
  total_users?: number; active_trips?: number; total_orders?: number; today_revenue?: number;
  pending_refunds?: number; pending_certifications?: number;
  daily_revenue_7days?: Array<{ date: string; revenue: number; order_count: number }>;
};

const nav = [
  ['总览', LayoutDashboard], ['用户与认证', Users], ['商家审核', Store], ['拼团管理', Car],
  ['订单与退款', ClipboardCheck], ['核销与结算', WalletCards], ['券管理', TicketPercent],
  ['邀请增长', TrendingUp], ['等级规则', ShieldCheck], ['客服投诉', MessageSquareText], ['操作日志', FileCheck2]
] as const;

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const token = localStorage.getItem('coroad_admin_token');
  const headers: Record<string, string> = { ...(options?.headers as Record<string, string> || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (!response.ok) throw new Error(`请求失败 (${response.status})`);
  const text = await response.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : {}; } catch (_) { throw new Error('API 返回非 JSON 响应'); }
  if (body.code && body.code !== 0 && body.code !== 200) throw new Error(body.message || '请求失败');
  return body.data ?? body;
}

function formatMoney(value = 0) { return `¥ ${Number(value).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}`; }
function maskPhone(phone?: string) { return phone ? phone.replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2') : '--'; }
function extractList(res: any): any[] { return res?.list || res?.records || (Array.isArray(res) ? res : []); }
function extractTotal(res: any): number { return res?.pagination?.total ?? (Array.isArray(res) ? res.length : 0); }
function fmtTime(v?: string) {
  if (!v) return '--';
  const d = new Date(v);
  if (isNaN(d.getTime())) return '--';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// ---------------------------------------------------------------------------
// 通用列表 Hook
// ---------------------------------------------------------------------------
function useList(path: string, query: Record<string, string | number | undefined> = {}) {
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [qs, setQs] = useState(query);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('pageSize', '20');
    Object.entries(qs).forEach(([k, v]) => { if (v !== undefined && v !== '') params.set(k, String(v)); });
    request<any>(`${path}?${params.toString()}`)
      .then((res) => { if (!cancelled) { setRows(extractList(res)); setTotal(extractTotal(res)); } })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : '加载失败'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [path, page, qs, refreshKey]);

  return {
    rows, total, loading, error, page, setPage,
    setQuery: (q: Record<string, string | number | undefined>) => { setQs(q); setPage(1); },
    reload: () => setRefreshKey((k) => k + 1)
  };
}

// ---------------------------------------------------------------------------
// 通用 UI 组件
// ---------------------------------------------------------------------------
function Pagination({ page, total, setPage }: { page: number; total: number; setPage: (n: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / 20));
  return (
    <div className="pagination">
      <span>共 {total} 条</span>
      <span>20条/页 ‹
        <button disabled={page <= 1} onClick={() => setPage(page - 1)}>上一页</button>
        <b> {page} </b>/ {pages}
        <button disabled={page >= pages} onClick={() => setPage(page + 1)}>下一页</button> ›
      </span>
    </div>
  );
}

function Badge({ text, tone }: { text: string; tone?: 'ok' | 'warn' | 'danger' | 'info' }) {
  const cls = tone ? `badge badge-${tone}` : 'badge';
  return <span className={cls}>{text}</span>;
}

function statusTone(status: number | string, okList: Array<number | string>) {
  return okList.includes(status) ? 'ok' : 'warn';
}

function ActionBtn({ children, onClick, danger }: { children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return <button className={danger ? 'btn-action danger' : 'btn-action'} onClick={onClick}>{children}</button>;
}

// ---------------------------------------------------------------------------
// 登录页
// ---------------------------------------------------------------------------
function LoginPage({ onLogin }: { onLogin: () => void }) {
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const doLogin = useCallback(async () => {
    if (!/^1[3-9]\d{9}$/.test(phone)) { setError('请输入正确的手机号'); return; }
    if (!password) { setError('请输入密码'); return; }
    setLoading(true); setError('');
    try {
      const result = await request<{ token: string; user: any }>('/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, password }),
      });
      localStorage.setItem('coroad_admin_token', result.token);
      localStorage.setItem('coroad_admin_user', JSON.stringify(result.user));
      onLogin();
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败');
    } finally { setLoading(false); }
  }, [phone, password, onLogin]);

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <span className="login-brand-mark"></span>
          <h1>同道 CoRoad</h1>
          <p>管理后台</p>
        </div>
        {error && <div className="login-error">{error}</div>}
        <input className="login-input" type="tel" placeholder="请输入手机号" maxLength={11} value={phone}
          onChange={e => { setPhone(e.target.value.replace(/\D/g, '')); setError(''); }} />
        <input className="login-input" type="password" placeholder="请输入密码" value={password}
          onChange={e => { setPassword(e.target.value); setError(''); }}
          onKeyDown={e => { if (e.key === 'Enter') doLogin(); }} />
        <button className="login-btn" disabled={loading || phone.length !== 11 || !password} onClick={doLogin}>
          {loading ? '登录中…' : '登 录'}
        </button>
        <div className="login-hint">默认密码：admin123</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 各业务模块
// ---------------------------------------------------------------------------
function UsersPage() {
  const { rows, total, loading, error, page, setPage, setQuery, reload } = useList('/admin/users');
  const [keyword, setKeyword] = useState('');
  const [cert, setCert] = useState('');

  const review = async (id: number, approved: boolean) => {
    await request(`/admin/certifications/${id}/review`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approved })
    });
    reload();
  };
  const toggleStatus = async (id: number, status: number) => {
    await request(`/admin/users/${id}/status`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
    reload();
  };

  return (
    <div className="panel table-panel">
      <div className="panel-head">
        <h2>用户列表</h2>
        <div className="filters">
          <input placeholder="昵称/手机号" value={keyword} onChange={e => setKeyword(e.target.value)} />
          <select value={cert} onChange={e => setCert(e.target.value)}>
            <option value="">全部认证状态</option><option value="0">未认证</option>
            <option value="1">审核中</option><option value="2">已认证</option>
          </select>
          <button onClick={() => setQuery({ keyword, is_certified: cert })}>查询</button>
        </div>
      </div>
      {error && <div className="error-banner">{error}</div>}
      {loading ? <div className="loading">加载中...</div> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>ID</th><th>昵称</th><th>手机号</th><th>等级</th><th>信用分</th><th>认证</th><th>行程/订单</th><th>注册时间</th><th>操作</th></tr></thead>
            <tbody>
              {rows.map(u => (
                <tr key={u.id}>
                  <td>{u.id}</td><td>{u.nickname || '--'}</td><td>{u.phone || '--'}</td>
                  <td>Lv.{u.level ?? 0}</td><td>{u.credit_score ?? '--'}</td>
                  <td><Badge text={['未认证', '审核中', '已认证'][u.is_certified] || '--'} tone={u.is_certified === 2 ? 'ok' : u.is_certified === 1 ? 'warn' : 'info'} /></td>
                  <td>{u.stats?.trip_count ?? 0} / {u.stats?.order_count ?? 0}</td>
                  <td>{fmtTime(u.created_at)}</td>
                  <td>
                    {u.is_certified === 1 && <>
                      <ActionBtn onClick={() => review(u.id, true)}>通过认证</ActionBtn>
                      <ActionBtn onClick={() => review(u.id, false)} danger>驳回</ActionBtn>
                    </>}
                    <ActionBtn danger={u.status === 1} onClick={() => toggleStatus(u.id, u.status === 1 ? 0 : 1)}>
                      {u.status === 1 ? '禁用' : '启用'}
                    </ActionBtn>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={9} className="empty-cell">暂无用户</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      <Pagination page={page} total={total} setPage={setPage} />
    </div>
  );
}

function MerchantsPage() {
  const { rows, total, loading, error, page, setPage, reload } = useList('/admin/merchants');
  const review = async (id: number, approved: boolean) => {
    await request(`/admin/merchants/${id}/review`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approved })
    });
    reload();
  };
  return (
    <div className="panel table-panel">
      <div className="panel-head"><h2>商家列表</h2><div className="filters"><button onClick={reload}><RefreshCw size={14} /> 刷新</button></div></div>
      {error && <div className="error-banner">{error}</div>}
      {loading ? <div className="loading">加载中...</div> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>ID</th><th>商家名称</th><th>类型</th><th>等级</th><th>评分</th><th>状态</th><th>商品/订单</th><th>入驻时间</th><th>操作</th></tr></thead>
            <tbody>
              {rows.map(m => (
                <tr key={m.id}>
                  <td>{m.id}</td><td>{m.name}</td><td>{m.type || '--'}</td>
                  <td>Lv.{m.level ?? 1}</td><td>{m.rating ?? '--'}</td>
                  <td><Badge text={m.status_text || '--'} tone={m.status === 1 ? 'ok' : m.status === 0 ? 'warn' : 'danger'} /></td>
                  <td>{m.stats?.product_count ?? 0} / {m.stats?.order_count ?? 0}</td>
                  <td>{fmtTime(m.created_at)}</td>
                  <td>
                    {m.status === 0 && <>
                      <ActionBtn onClick={() => review(m.id, true)}>通过</ActionBtn>
                      <ActionBtn onClick={() => review(m.id, false)} danger>驳回</ActionBtn>
                    </>}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={9} className="empty-cell">暂无商家</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      <Pagination page={page} total={total} setPage={setPage} />
    </div>
  );
}

function GroupBuysPage() {
  const { rows, total, loading, error, page, setPage, reload } = useList('/admin/group-buys');
  const end = async (id: number, action: 'success' | 'fail') => {
    await request(`/admin/group-buys/${id}/end`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action })
    });
    reload();
  };
  return (
    <div className="panel table-panel">
      <div className="panel-head"><h2>拼团活动</h2><div className="filters"><button onClick={reload}><RefreshCw size={14} /> 刷新</button></div></div>
      {error && <div className="error-banner">{error}</div>}
      {loading ? <div className="loading">加载中...</div> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>ID</th><th>商品</th><th>商家</th><th>发起人</th><th>进度</th><th>状态</th><th>截止时间</th><th>操作</th></tr></thead>
            <tbody>
              {rows.map(a => (
                <tr key={a.id}>
                  <td>{a.id}</td><td>{a.product?.name || '--'}</td><td>{a.merchant?.name || '--'}</td>
                  <td>{a.initiator?.nickname || '--'}</td>
                  <td>{a.current_count ?? 0}/{a.target_count ?? 0} ({a.progress ?? 0}%)</td>
                  <td><Badge text={a.status_text || '--'} tone={a.status === 2 ? 'ok' : a.status === 1 ? 'info' : 'danger'} /></td>
                  <td>{fmtTime(a.expire_at)}</td>
                  <td>{a.status === 1 && <>
                    <ActionBtn onClick={() => end(a.id, 'success')}>标记成功</ActionBtn>
                    <ActionBtn onClick={() => end(a.id, 'fail')} danger>标记失败</ActionBtn>
                  </>}</td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={8} className="empty-cell">暂无拼团活动</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      <Pagination page={page} total={total} setPage={setPage} />
    </div>
  );
}

function OrdersPage() {
  const { rows, total, loading, error, page, setPage, reload } = useList('/admin/orders');
  const refund = async (id: number, approved: boolean) => {
    await request(`/admin/orders/${id}/refund`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approved })
    });
    reload();
  };
  return (
    <div className="panel table-panel">
      <div className="panel-head"><h2>订单列表</h2><div className="filters"><button onClick={reload}><RefreshCw size={14} /> 刷新</button></div></div>
      {error && <div className="error-banner">{error}</div>}
      {loading ? <div className="loading">加载中...</div> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>订单号</th><th>用户</th><th>商品</th><th>商家</th><th>金额</th><th>优惠</th><th>状态</th><th>下单时间</th><th>操作</th></tr></thead>
            <tbody>
              {rows.map(o => (
                <tr key={o.id}>
                  <td>{o.order_no}</td><td>{o.user?.nickname || '--'}</td><td>{o.product?.name || '--'}</td>
                  <td>{o.merchant?.name || '--'}</td><td>{formatMoney(o.pay_amount)}</td>
                  <td>{o.coupon_discount ? `-${formatMoney(o.coupon_discount)}` : '--'}</td>
                  <td><Badge text={o.status_text || '--'} tone={statusTone(o.status, [3, 4])} /></td>
                  <td>{fmtTime(o.created_at)}</td>
                  <td>{o.status === 5 && <>
                    <ActionBtn onClick={() => refund(o.id, true)}>同意退款</ActionBtn>
                    <ActionBtn onClick={() => refund(o.id, false)} danger>拒绝</ActionBtn>
                  </>}</td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={9} className="empty-cell">暂无订单</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      <Pagination page={page} total={total} setPage={setPage} />
    </div>
  );
}

function SettlementsPage() {
  const { rows, total, loading, error, page, setPage, reload } = useList('/admin/settlements');
  const trigger = async (orderId: number) => {
    await request('/admin/settlements/trigger', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order_id: orderId })
    });
    reload();
  };
  return (
    <div className="panel table-panel">
      <div className="panel-head"><h2>结算记录</h2><div className="filters"><button onClick={reload}><RefreshCw size={14} /> 刷新</button></div></div>
      {error && <div className="error-banner">{error}</div>}
      {loading ? <div className="loading">加载中...</div> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>ID</th><th>订单号</th><th>商家</th><th>订单金额</th><th>佣金率</th><th>佣金</th><th>结算金额</th><th>状态</th><th>创建时间</th><th>操作</th></tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id}>
                  <td>{r.id}</td><td>{r.order_no}</td><td>{r.merchant?.name || '--'}</td>
                  <td>{formatMoney(r.order_amount)}</td>
                  <td>{r.commission_rate != null ? `${(r.commission_rate * 100).toFixed(0)}%` : '--'}</td>
                  <td>{formatMoney(r.commission_amount)}</td><td>{formatMoney(r.settlement_amount)}</td>
                  <td><Badge text={r.status_text || '--'} tone={r.status === 1 ? 'ok' : 'warn'} /></td>
                  <td>{fmtTime(r.created_at)}</td>
                  <td>{r.status === 0 && <ActionBtn onClick={() => trigger(r.order_id)}>生成结算</ActionBtn>}</td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={10} className="empty-cell">暂无结算记录</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      <Pagination page={page} total={total} setPage={setPage} />
    </div>
  );
}

function CouponsPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ name: '', type: '0', condition_amount: '', discount_amount: '', discount_percent: '', total_quantity: '', valid_days: '' });
  const load = useCallback(() => {
    setLoading(true); setError('');
    request<any>('/admin/coupons')
      .then(setData)
      .catch(e => setError(e instanceof Error ? e.message : '加载失败'))
      .finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);
  const rows = extractList(data);
  const create = async () => {
    try {
      await request('/admin/coupons/config', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name, type: Number(form.type),
          condition_amount: form.type === '0' ? Number(form.condition_amount) : undefined,
          discount_amount: form.type === '0' ? Number(form.discount_amount) : undefined,
          discount_percent: form.type === '1' ? Number(form.discount_percent) : undefined,
          total_quantity: Number(form.total_quantity), valid_days: Number(form.valid_days)
        })
      });
      setForm({ name: '', type: '0', condition_amount: '', discount_amount: '', discount_percent: '', total_quantity: '', valid_days: '' });
      load();
    } catch (e) { alert(e instanceof Error ? e.message : '创建失败'); }
  };
  const overall = data?.overall || data?.overall_stats || {};
  return (
    <div className="panel table-panel">
      <div className="panel-head"><h2>券管理</h2><div className="filters"><button onClick={load}><RefreshCw size={14} /> 刷新</button></div></div>
      {error && <div className="error-banner">{error}</div>}
      <div className="metric-strip">
        {[
          ['券模板', overall?.active_templates ?? 0], ['累计发放', overall?.total_issued ?? 0],
          ['已使用', overall?.total_used ?? 0], ['可用', overall?.available_count ?? 0],
          ['已过期', overall?.expired_count ?? 0], ['累计抵扣', formatMoney(overall?.total_discount_amount)]
        ].map(([label, value]) => (
          <div className="metric" key={String(label)}><div><span className="metric-label">{label}</span><strong>{value}</strong></div></div>
        ))}
      </div>
      {loading ? <div className="loading">加载中...</div> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>ID</th><th>名称</th><th>类型</th><th>门槛</th><th>面额/折扣</th><th>总量</th><th>已用</th><th>有效天数</th><th>状态</th></tr></thead>
            <tbody>
              {rows.map(c => (
                <tr key={c.id}>
                  <td>{c.id}</td><td>{c.name}</td><td>{c.type_text || '--'}</td>
                  <td>{c.condition_amount ? `满${c.condition_amount}` : '无门槛'}</td>
                  <td>{c.discount_amount ? `减${c.discount_amount}` : c.discount_percent ? `${c.discount_percent}折` : '--'}</td>
                  <td>{c.total_quantity ?? '--'}</td><td>{c.used_quantity ?? c.issued_count ?? 0}</td>
                  <td>{c.valid_days ?? '--'}</td>
                  <td><Badge text={c.status === 1 ? '启用' : '停用'} tone={c.status === 1 ? 'ok' : 'info'} /></td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={9} className="empty-cell">暂无券模板</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      <div className="panel-head" style={{ marginTop: 16 }}><h2>创建券模板</h2></div>
      <div className="filters" style={{ flexWrap: 'wrap' }}>
        <input placeholder="券名称" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
        <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
          <option value="0">满减券</option><option value="1">折扣券</option><option value="2">商家券</option><option value="3">邀请券</option>
        </select>
        {form.type === '0' && <>
          <input placeholder="满额" value={form.condition_amount} onChange={e => setForm({ ...form, condition_amount: e.target.value })} />
          <input placeholder="减额" value={form.discount_amount} onChange={e => setForm({ ...form, discount_amount: e.target.value })} />
        </>}
        {form.type === '1' && <input placeholder="折扣(1-100)" value={form.discount_percent} onChange={e => setForm({ ...form, discount_percent: e.target.value })} />}
        <input placeholder="发行总量" value={form.total_quantity} onChange={e => setForm({ ...form, total_quantity: e.target.value })} />
        <input placeholder="有效天数" value={form.valid_days} onChange={e => setForm({ ...form, valid_days: e.target.value })} />
        <button onClick={create}>创建</button>
      </div>
    </div>
  );
}

function InvitesPage() {
  const [stats, setStats] = useState<any>(null);
  const [rewards, setRewards] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    Promise.all([request<any>('/admin/invites'), request<any>('/admin/invites/rewards')])
      .then(([s, r]) => { setStats(s); setRewards(extractList(r)); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);
  if (loading) return <div className="loading">加载中...</div>;
  const conv = stats?.conversion || {};
  return (
    <>
      <div className="metric-strip">
        {[
          ['累计邀请', stats?.total_invites ?? 0], ['邀请人', stats?.total_inviters ?? 0],
          ['已发奖励', stats?.rewarded_count ?? 0], ['邀请率', `${stats?.invite_rate ?? 0}%`],
          ['被邀用户', conv?.total_invited_users ?? 0], ['转化率', `${conv?.conversion_rate ?? 0}%`]
        ].map(([label, value]) => (
          <div className="metric" key={String(label)}><div><span className="metric-label">{label}</span><strong>{value}</strong></div></div>
        ))}
      </div>
      <div className="panel table-panel">
        <div className="panel-head"><h2>邀请排行</h2></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>用户</th><th>手机号</th><th>邀请人数</th><th>已奖励</th></tr></thead>
            <tbody>
              {(stats?.top_inviters || []).map((t: any, i: number) => (
                <tr key={i}><td>{t.nickname || '--'}</td><td>{t.phone || '--'}</td><td>{t.invite_count}</td><td>{t.rewarded_count}</td></tr>
              ))}
              {!(stats?.top_inviters || []).length && <tr><td colSpan={4} className="empty-cell">暂无邀请数据</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      <div className="panel table-panel">
        <div className="panel-head"><h2>奖励发放记录</h2></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>ID</th><th>用户</th><th>类型</th><th>数量</th><th>状态</th><th>时间</th></tr></thead>
            <tbody>
              {rewards.map((r: any) => (
                <tr key={r.id}><td>{r.id}</td><td>{r.nickname || r.user?.nickname || '--'}</td><td>{r.reward_type || r.type || '--'}</td><td>{r.amount ?? r.quantity ?? '--'}</td><td>{r.status_text || r.status || '--'}</td><td>{fmtTime(r.created_at)}</td></tr>
              ))}
              {rewards.length === 0 && <tr><td colSpan={6} className="empty-cell">暂无奖励记录</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function LevelsPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [factors, setFactors] = useState<Record<string, number>>({});
  const load = useCallback(() => {
    setLoading(true);
    request<any>('/admin/growth/config').then((res) => { setData(res); setFactors({ ...(res.factors || res.current_config?.growth_factors || {}) }); }).finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);
  if (loading) return <div className="loading">加载中...</div>;
  const factorLabels: Record<string, string> = {
    drive_distance: '行驶里程', trip_complete: '完成行程', team_leader: '担任队长',
    invite_user: '邀请用户', daily_checkin: '每日签到', review_merchant: '评价商家', group_buy_count: '参与拼团'
  };
  const levels = data?.levels || data?.current_config?.level_thresholds || [];
  const save = async () => {
    await request('/admin/growth/config', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ factors })
    });
    load();
  };
  return (
    <>
      <div className="panel table-panel">
        <div className="panel-head"><h2>同路值因子配置</h2><button onClick={save}>保存配置</button></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>维度</th><th>分值</th></tr></thead>
            <tbody>
              {Object.entries(factors).map(([key, value]) => (
                <tr key={key}>
                  <td>{factorLabels[key] || key}</td>
                  <td><input type="number" value={value} onChange={e => setFactors({ ...factors, [key]: Number(e.target.value) })} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="panel table-panel">
        <div className="panel-head"><h2>等级阈值</h2></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>等级</th><th>名称</th><th>最低同路值</th></tr></thead>
            <tbody>
              {levels.map((l: any, i: number) => (
                <tr key={i}><td>Lv.{l.level}</td><td>{l.name || l.level_name || '--'}</td><td>{l.min ?? l.threshold ?? '--'}</td></tr>
              ))}
              {levels.length === 0 && <tr><td colSpan={3} className="empty-cell">暂无配置</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function TicketsPage() {
  const { rows, total, loading, error, page, setPage, reload } = useList('/admin/support-tickets');
  const resolve = async (id: number, status: number) => {
    await request(`/admin/support-tickets/${id}/resolve`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
    reload();
  };
  return (
    <div className="panel table-panel">
      <div className="panel-head"><h2>客服工单</h2><div className="filters"><button onClick={reload}><RefreshCw size={14} /> 刷新</button></div></div>
      {error && <div className="error-banner">{error}</div>}
      {loading ? <div className="loading">加载中...</div> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>ID</th><th>用户</th><th>分类</th><th>主题</th><th>内容</th><th>优先级</th><th>状态</th><th>提交时间</th><th>操作</th></tr></thead>
            <tbody>
              {rows.map(t => (
                <tr key={t.id}>
                  <td>{t.id}</td><td>{t.user?.nickname || '--'}</td><td>{t.category || '--'}</td>
                  <td>{t.subject}</td><td className="cell-ellipsis">{t.content}</td>
                  <td>{t.priority || '--'}</td>
                  <td><Badge text={t.status_text || '--'} tone={t.status === 2 ? 'ok' : t.status === 0 ? 'warn' : 'info'} /></td>
                  <td>{fmtTime(t.created_at)}</td>
                  <td>
                    {t.status === 0 && <ActionBtn onClick={() => resolve(t.id, 1)}>开始处理</ActionBtn>}
                    {t.status === 1 && <ActionBtn onClick={() => resolve(t.id, 2)}>标记解决</ActionBtn>}
                    {t.status !== 3 && <ActionBtn onClick={() => resolve(t.id, 3)} danger>关闭</ActionBtn>}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={9} className="empty-cell">暂无工单</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      <Pagination page={page} total={total} setPage={setPage} />
    </div>
  );
}

function LogsPage() {
  const { rows, total, loading, error, page, setPage } = useList('/admin/logs');
  return (
    <div className="panel table-panel">
      <div className="panel-head"><h2>操作日志</h2></div>
      {error && <div className="error-banner">{error}</div>}
      {loading ? <div className="loading">加载中...</div> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>ID</th><th>用户</th><th>动作</th><th>对象类型</th><th>对象ID</th><th>详情</th><th>时间</th></tr></thead>
            <tbody>
              {rows.map(l => (
                <tr key={l.id}>
                  <td>{l.id}</td><td>{l.user?.nickname || '系统'}</td><td>{l.action}</td>
                  <td>{l.target_type || '--'}</td><td>{l.target_id || '--'}</td>
                  <td className="cell-ellipsis">{l.detail ? JSON.stringify(l.detail) : '--'}</td>
                  <td>{fmtTime(l.created_at)}</td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={7} className="empty-cell">暂无日志</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      <Pagination page={page} total={total} setPage={setPage} />
    </div>
  );
}

function DashboardPage({ dashboard, health, reload }: {
  dashboard: Dashboard;
  health: Health[];
  reload: () => void;
}) {
  const [pending, setPending] = useState<{ users: any[]; merchants: any[]; orders: any[]; tickets: any[] }>({ users: [], merchants: [], orders: [], tickets: [] });
  useEffect(() => {
    Promise.all([
      request<any>('/admin/users?is_certified=1&pageSize=3').catch(() => ({ list: [] })),
      request<any>('/admin/merchants?status=0&pageSize=3').catch(() => ({ list: [] })),
      request<any>('/admin/orders?pageSize=50').catch(() => ({ list: [] })),
      request<any>('/admin/support-tickets?status=0&pageSize=3').catch(() => ({ list: [] }))
    ]).then(([u, m, o, t]) => {
      const refundOrders = extractList(o).filter((x: any) => x.status === 5 || x.status === 7).slice(0, 3);
      setPending({ users: extractList(u), merchants: extractList(m), orders: refundOrders, tickets: extractList(t) });
    });
  }, []);

  const metrics = [
    ['新增用户', dashboard.total_users || 0, Users], ['活跃车队', dashboard.active_trips || 0, Car],
    ['订单数', dashboard.total_orders || 0, WalletCards], ['今日交易额', formatMoney(dashboard.today_revenue), CircleDollarSign],
    ['待退款', dashboard.pending_refunds || 0, ClipboardCheck], ['待审核认证', dashboard.pending_certifications || 0, ShieldCheck]
  ] as const;
  const trend = dashboard.daily_revenue_7days || [];
  const queue = [
    { type: '车主认证', text: `${pending.users.length} 条认证申请待审核`, priority: pending.users.length > 0 ? '高' : '低', time: '待办' },
    { type: '商家入驻', text: `${pending.merchants.length} 条商家入驻待审核`, priority: pending.merchants.length > 0 ? '中' : '低', time: '待办' },
    { type: '退款申请', text: `${pending.orders.length} 条退款申请待处理`, priority: pending.orders.length > 0 ? '高' : '低', time: '待办' },
    { type: '投诉工单', text: `${pending.tickets.length} 条投诉工单待处理`, priority: pending.tickets.length > 0 ? '高' : '低', time: '待办' }
  ];

  return (
    <>
      <div className="metric-strip">{metrics.map(([label, value, Icon]) => (
        <div className="metric" key={label}><Icon size={25} strokeWidth={1.8} /><div><span className="metric-label">{label}</span><strong>{value}</strong></div></div>
      ))}</div>
      <div className="overview-grid">
        <section className="panel queue">
          <div className="panel-head"><h2>待办队列</h2></div>
          {queue.map((q) => (
            <div className="queue-row" key={q.type}>
              <span className="queue-type">{q.type}</span><span className="queue-text">{q.text}</span>
              <span className={`priority ${q.priority === '高' ? 'high' : q.priority === '中' ? 'medium' : 'low'}`}>{q.priority}</span>
              <span className="queue-time">{q.time}</span>
            </div>
          ))}
        </section>
        <section className="panel chart-panel">
          <div className="panel-head"><h2>交易趋势（近7天）</h2></div>
          <div className="chart-summary">
            <div><span>交易金额（元）</span><strong>{formatMoney(dashboard.today_revenue)}</strong></div>
            <div><span>订单数（笔）</span><strong>{dashboard.total_orders || 0}</strong></div>
          </div>
          <div className="chart">
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={trend.length ? trend : []}>
                <defs><linearGradient id="area" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#1ca567" stopOpacity={0.2} /><stop offset="100%" stopColor="#1ca567" stopOpacity={0} /></linearGradient></defs>
                <CartesianGrid stroke="#e7ece9" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Area type="monotone" dataKey="revenue" stroke="#17a464" fill="url(#area)" strokeWidth={2.5} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>
      <section className="panel table-panel">
        <div className="panel-head"><h2>退款申请</h2><button onClick={reload}><RefreshCw size={14} /> 刷新</button></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>订单号</th><th>用户</th><th>商品</th><th>金额</th><th>状态</th><th>下单时间</th></tr></thead>
            <tbody>
              {pending.orders.map((o) => (
                <tr key={o.id}>
                  <td>{o.order_no}</td><td>{o.user?.nickname || '--'}</td><td>{o.product?.name || '--'}</td>
                  <td>{formatMoney(o.pay_amount)}</td><td>{o.status_text || '--'}</td><td>{fmtTime(o.created_at)}</td>
                </tr>
              ))}
              {pending.orders.length === 0 && <tr><td colSpan={6} className="empty-cell">暂无退款申请</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
      <section className="panel health-panel">
        <div className="panel-head"><h2>平台健康 <small>（更新时间：{new Date().toLocaleTimeString('zh-CN', { hour12: false })}）</small></h2></div>
        <div className="health-grid">
          {(health.length ? health : ['api', 'mysql', 'redis', 'payment_callback', 'messaging'].map(name => ({ name, status: 'unknown' }))).map(item => (
            <div className="health-item" key={item.name}>
              <Activity size={21} className={item.status === 'healthy' ? 'ok' : 'warn'} />
              <div><strong>{item.name === 'mysql' ? '数据库' : item.name === 'payment_callback' ? '支付回调' : item.name === 'messaging' ? '消息推送' : item.name.toUpperCase()}</strong>
                <span className={item.status === 'healthy' ? 'ok-text' : 'warn-text'}>{item.status === 'healthy' ? '正常' : '待配置'} {item.latency_ms ? `${item.latency_ms}ms` : ''}</span></div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

// ---------------------------------------------------------------------------
// 主应用
// ---------------------------------------------------------------------------
function App() {
  const [active, setActive] = useState('总览');
  const [dashboard, setDashboard] = useState<Dashboard>({});
  const [health, setHealth] = useState<Health[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [loggedIn, setLoggedIn] = useState(() => !!localStorage.getItem('coroad_admin_token'));
  const [adminUser, setAdminUser] = useState<any>(() => {
    try { return JSON.parse(localStorage.getItem('coroad_admin_user') || '{}'); } catch { return {}; }
  });

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [stats, status] = await Promise.all([
        request<Dashboard>('/admin/dashboard'),
        request<{ checks: Health[] }>('/admin/health')
      ]);
      setDashboard(stats);
      setHealth(status.checks || []);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '加载失败';
      if (msg.includes('401')) {
        localStorage.removeItem('coroad_admin_token');
        localStorage.removeItem('coroad_admin_user');
        setLoggedIn(false);
      } else {
        setError(msg);
      }
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { if (loggedIn) load(); }, [loggedIn, load]);

  const handleLogout = () => {
    localStorage.removeItem('coroad_admin_token');
    localStorage.removeItem('coroad_admin_user');
    setLoggedIn(false);
  };

  if (!loggedIn) return <LoginPage onLogin={() => setLoggedIn(true)} />;

  return (
    <div className="admin-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">↗</span><span>同道 CoRoad</span></div>
        <div className="nav-list">{nav.map(([label, Icon]) => (
          <button key={label} className={active === label ? 'nav-item active' : 'nav-item'} onClick={() => setActive(label)}>
            <Icon size={18} /><span>{label}</span>
          </button>
        ))}</div>
        <div className="collapse">‹ <span>收起菜单</span></div>
      </aside>
      <main className="main-content">
        <header className="topbar">
          <button className="menu-button"><Menu size={20} /></button>
          <div className="top-actions">
            <div className="date-box">▣ {new Date().toLocaleDateString('zh-CN')}</div>
            <div className="search-box"><Search size={16} /><input aria-label="全局搜索" placeholder="全局搜索（用户/订单/商家/内容）" /></div>
            <Bell size={20} />
            <div className="profile"><span className="avatar">{adminUser.nickname?.[0] || '管'}</span><span>{adminUser.nickname || '管理员'}</span><ChevronDown size={15} /></div>
            <button className="logout-btn" onClick={handleLogout} title="退出登录"><LogOut size={16} /></button>
          </div>
        </header>
        <section className="page-content">
          <div className="page-title">
            <h1>{active}</h1>
            <button className="refresh" onClick={load} disabled={loading}><RefreshCw size={15} className={loading ? 'spin' : ''} /> 刷新</button>
          </div>
          {error && <div className="error-banner">{error}</div>}
          {active === '总览' && <DashboardPage dashboard={dashboard} health={health} reload={load} />}
          {active === '用户与认证' && <UsersPage />}
          {active === '商家审核' && <MerchantsPage />}
          {active === '拼团管理' && <GroupBuysPage />}
          {active === '订单与退款' && <OrdersPage />}
          {active === '核销与结算' && <SettlementsPage />}
          {active === '券管理' && <CouponsPage />}
          {active === '邀请增长' && <InvitesPage />}
          {active === '等级规则' && <LevelsPage />}
          {active === '客服投诉' && <TicketsPage />}
          {active === '操作日志' && <LogsPage />}
        </section>
      </main>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
