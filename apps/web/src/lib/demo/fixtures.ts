/**
 * Demo fixtures — 架空の日本語 B2B サンプルデータ。
 *
 * 本番DB接続前の Phase 1 で、各画面に「中身」を見せるための単一ソース。
 * 全ての demo データは ID prefix `demo-` を持ち、本番データと混在しない設計。
 *
 * 商談・連絡先・録画・メンバーは互いに参照整合性がとれているので、
 * 検索画面で「田中商事の価格交渉」のような横断結果を再現できる。
 */

export type DemoRole = 'admin' | 'manager' | 'member';

export type DemoMember = {
  id: string;
  fullName: string;
  email: string;
  role: DemoRole;
  initials: string;
  /** ISO datetime */
  lastSeenAt: string;
  status: 'active' | 'invited' | 'suspended';
  department: string;
};

export type DemoContactStatus = 'verified' | 'pending_review' | 'duplicate_suspect';

export type DemoContact = {
  id: string;
  fullName: string;
  furigana: string;
  companyName: string;
  title: string;
  email: string;
  phone: string;
  /** Member.id (担当者) */
  ownerId: string;
  status: DemoContactStatus;
  /** ISO date — 名刺取り込み日 */
  capturedAt: string;
  source: 'card_scan' | 'manual' | 'meeting_attendee';
  note: string;
  /** 重複候補 contact ID */
  duplicateOf?: string;
};

export type DemoMeetingStage = 'scheduled' | 'in_progress' | 'won' | 'lost' | 'on_hold';

export type DemoMeeting = {
  id: string;
  title: string;
  companyName: string;
  /** Member.id */
  ownerId: string;
  /** DemoContact.id[] (出席者) */
  attendeeIds: string[];
  stage: DemoMeetingStage;
  amountJpy: number;
  /** ISO datetime — 商談日 */
  scheduledAt: string;
  durationMin: number;
  /** AI 要約 (90字目安) */
  aiSummary: string;
  /** 次のアクション (45字目安) */
  nextAction: string;
  /** 約束事項 — タイムスタンプ秒付き */
  commitments: { atSec: number; text: string }[];
  /** Recording.id があれば紐づく */
  recordingId?: string;
};

export type DemoRecording = {
  id: string;
  title: string;
  /** Meeting.id */
  meetingId: string;
  /** ISO datetime — 録画日 */
  recordedAt: string;
  durationSec: number;
  /** 文字起こしの抜粋 (180字目安) */
  transcriptExcerpt: string;
  /** AI 要約 */
  aiSummary: string;
  /** 話者ごとの発話比率 (合計100) */
  speakerSplit: { name: string; pct: number }[];
  /** トーンの起伏 — 値域 0-100 */
  sentimentCurve: number[];
  /** 話題ハイライト (タイムスタンプ秒 + ラベル) */
  highlights: { atSec: number; label: string }[];
};

// ============================================================================
// Members
// ============================================================================

export const DEMO_MEMBERS: DemoMember[] = [
  {
    id: 'demo-u-001',
    fullName: '佐藤 翔太',
    email: 'sato.shota@example.knowledge.jp',
    role: 'admin',
    initials: 'SS',
    lastSeenAt: '2026-05-11T08:42:00+09:00',
    status: 'active',
    department: '営業統括',
  },
  {
    id: 'demo-u-002',
    fullName: '鈴木 美咲',
    email: 'suzuki.misaki@example.knowledge.jp',
    role: 'manager',
    initials: 'SM',
    lastSeenAt: '2026-05-11T07:58:00+09:00',
    status: 'active',
    department: '法人営業 1G',
  },
  {
    id: 'demo-u-003',
    fullName: '田中 健太郎',
    email: 'tanaka.kentaro@example.knowledge.jp',
    role: 'member',
    initials: 'TK',
    lastSeenAt: '2026-05-10T19:11:00+09:00',
    status: 'active',
    department: '法人営業 1G',
  },
  {
    id: 'demo-u-004',
    fullName: '高橋 由佳',
    email: 'takahashi.yuka@example.knowledge.jp',
    role: 'member',
    initials: 'TY',
    lastSeenAt: '2026-05-09T16:24:00+09:00',
    status: 'active',
    department: '法人営業 2G',
  },
  {
    id: 'demo-u-005',
    fullName: '伊藤 拓也',
    email: 'ito.takuya@example.knowledge.jp',
    role: 'member',
    initials: 'IT',
    lastSeenAt: '2026-05-08T11:05:00+09:00',
    status: 'invited',
    department: '法人営業 2G',
  },
  {
    id: 'demo-u-006',
    fullName: '渡辺 真理',
    email: 'watanabe.mari@example.knowledge.jp',
    role: 'manager',
    initials: 'WM',
    lastSeenAt: '2026-04-21T10:18:00+09:00',
    status: 'suspended',
    department: '法人営業 3G',
  },
];

// ============================================================================
// Contacts (名刺)
// ============================================================================

export const DEMO_CONTACTS: DemoContact[] = [
  {
    id: 'demo-c-001',
    fullName: '中村 一郎',
    furigana: 'なかむら いちろう',
    companyName: '田中商事 株式会社',
    title: '購買部 部長',
    email: 'nakamura@tanaka-shoji.example.jp',
    phone: '03-1234-5678',
    ownerId: 'demo-u-002',
    status: 'verified',
    capturedAt: '2026-05-08',
    source: 'card_scan',
    note: 'コスト最適化の決裁者。年度予算は 4 月確定で動きやすい。',
  },
  {
    id: 'demo-c-002',
    fullName: '小林 恵',
    furigana: 'こばやし めぐみ',
    companyName: 'フェニックス田中 株式会社',
    title: '情報システム部 課長',
    email: 'kobayashi@phx-tanaka.example.jp',
    phone: '03-2345-6789',
    ownerId: 'demo-u-003',
    status: 'pending_review',
    capturedAt: '2026-05-09',
    source: 'card_scan',
    note: 'OCR 結果に「課長」の読み取り揺れあり (係長候補)。',
  },
  {
    id: 'demo-c-003',
    fullName: '加藤 美咲',
    furigana: 'かとう みさき',
    companyName: '株式会社 ナチュラルプレイ',
    title: 'COO',
    email: 'kato@natural-play.example.jp',
    phone: '050-3456-7890',
    ownerId: 'demo-u-002',
    status: 'verified',
    capturedAt: '2026-05-06',
    source: 'meeting_attendee',
    note: '初回商談で意気投合。次回までに事例 PDF 送付の約束。',
  },
  {
    id: 'demo-c-004',
    fullName: '山田 太郎',
    furigana: 'やまだ たろう',
    companyName: '田中商事 株式会社',
    title: '購買部 主任',
    email: 'yamada@tanaka-shoji.example.jp',
    phone: '03-1234-5679',
    ownerId: 'demo-u-003',
    status: 'duplicate_suspect',
    capturedAt: '2026-05-10',
    source: 'card_scan',
    note: '中村部長と同じ部署。同姓同名の別人 (山田) と区別が必要。',
    duplicateOf: 'demo-c-005',
  },
  {
    id: 'demo-c-005',
    fullName: '山田 太郎',
    furigana: 'やまだ たろう',
    companyName: '株式会社 やまだ建設',
    title: '営業部 課長',
    email: 'yamada@yamada-kensetsu.example.jp',
    phone: '03-9876-5432',
    ownerId: 'demo-u-004',
    status: 'verified',
    capturedAt: '2026-04-22',
    source: 'manual',
    note: '建設業界の既存顧客。',
  },
  {
    id: 'demo-c-006',
    fullName: '吉田 葵',
    furigana: 'よしだ あおい',
    companyName: 'ブルーオーシャン 株式会社',
    title: '経営企画部 マネージャー',
    email: 'yoshida@blue-ocean.example.jp',
    phone: '03-5555-1212',
    ownerId: 'demo-u-004',
    status: 'verified',
    capturedAt: '2026-05-03',
    source: 'card_scan',
    note: '海外展開を検討中。英語資料が刺さる相手。',
  },
  {
    id: 'demo-c-007',
    fullName: '松本 健',
    furigana: 'まつもと けん',
    companyName: '株式会社 ナチュラルプレイ',
    title: 'CTO',
    email: 'matsumoto@natural-play.example.jp',
    phone: '050-3456-7891',
    ownerId: 'demo-u-002',
    status: 'pending_review',
    capturedAt: '2026-05-09',
    source: 'meeting_attendee',
    note: 'メールアドレスが手書きで判読困難。要再確認。',
  },
];

// ============================================================================
// Meetings (商談)
// ============================================================================

export const DEMO_MEETINGS: DemoMeeting[] = [
  {
    id: 'demo-m-001',
    title: '田中商事 — 年度更新 / 拡張ライセンス',
    companyName: '田中商事 株式会社',
    ownerId: 'demo-u-002',
    attendeeIds: ['demo-c-001'],
    stage: 'won',
    amountJpy: 4_800_000,
    scheduledAt: '2026-05-07T14:00:00+09:00',
    durationMin: 45,
    aiSummary:
      '昨年度の利用実績データをもとに、来期は 60 → 90 ライセンスへ拡張する方向で合意。導入支援 SLA を据え置きで提供する代わりに、3 年契約での金額調整を中村部長から打診。',
    nextAction: '見積書 (3 年プラン) を 5/13 までに送付',
    commitments: [
      { atSec: 421, text: '3 年契約で 5% ディスカウント可否を社内確認' },
      { atSec: 1820, text: '導入支援 SLA の現行内容を文書化して送る' },
    ],
    recordingId: 'demo-r-001',
  },
  {
    id: 'demo-m-002',
    title: 'フェニックス田中 — POC 評価レビュー',
    companyName: 'フェニックス田中 株式会社',
    ownerId: 'demo-u-003',
    attendeeIds: ['demo-c-002'],
    stage: 'lost',
    amountJpy: 2_200_000,
    scheduledAt: '2026-05-02T10:00:00+09:00',
    durationMin: 60,
    aiSummary:
      'POC の結果は良好だったが、本年度の IT 予算が想定より早く枯渇。再検討は 2026 年下期。「機能ではなく、組み込み工数の懸念が大きかった」と小林課長が率直に共有。',
    nextAction: '10 月再開の際に再アプローチ。ナーチャー継続',
    commitments: [
      { atSec: 1135, text: '組み込み事例集を 1 ページにまとめて送付' },
    ],
    recordingId: 'demo-r-002',
  },
  {
    id: 'demo-m-003',
    title: 'ナチュラルプレイ — 初回ヒアリング',
    companyName: '株式会社 ナチュラルプレイ',
    ownerId: 'demo-u-002',
    attendeeIds: ['demo-c-003', 'demo-c-007'],
    stage: 'in_progress',
    amountJpy: 3_600_000,
    scheduledAt: '2026-05-06T15:30:00+09:00',
    durationMin: 50,
    aiSummary:
      '加藤 COO と松本 CTO が同席。営業活動の属人化と「言った言わない」が経営課題。録画の自動要約 + 検索のデモに強く反応。価格よりも社内の運用負荷を懸念する傾向。',
    nextAction: '5/13 までに 30 日トライアル開始の段取り共有',
    commitments: [
      { atSec: 612, text: '導入企業 (SaaS / 50 名規模) の事例 PDF を送付' },
      { atSec: 2104, text: '次回までに権限管理の Q&A を整理して持参' },
    ],
    recordingId: 'demo-r-003',
  },
  {
    id: 'demo-m-004',
    title: 'ブルーオーシャン — 経営層向けデモ',
    companyName: 'ブルーオーシャン 株式会社',
    ownerId: 'demo-u-004',
    attendeeIds: ['demo-c-006'],
    stage: 'scheduled',
    amountJpy: 5_500_000,
    scheduledAt: '2026-05-13T11:00:00+09:00',
    durationMin: 60,
    aiSummary:
      '海外展開の意思決定タイミング。前回 (4 月) のヒアリング内容を踏まえ、英語 UI と多通貨表示のデモを中心に組み立て直し。吉田マネージャーから経営陣 3 名が同席予定との連絡あり。',
    nextAction: '英語デモ環境と多通貨デモを 5/12 までに準備',
    commitments: [],
  },
  {
    id: 'demo-m-005',
    title: 'やまだ建設 — 既存顧客 QBR',
    companyName: '株式会社 やまだ建設',
    ownerId: 'demo-u-004',
    attendeeIds: ['demo-c-005'],
    stage: 'on_hold',
    amountJpy: 0,
    scheduledAt: '2026-04-26T13:00:00+09:00',
    durationMin: 40,
    aiSummary:
      '四半期レビュー。利用は安定。ただし山田課長が異動の可能性ありで、後任が決まるまで新規機能の意思決定は保留。引き継ぎ資料の準備を依頼された。',
    nextAction: '後任が決まり次第、再オンボーディング日程を相談',
    commitments: [
      { atSec: 882, text: '管理者向け操作手順を A4 1 枚に圧縮して送付' },
    ],
  },
];

// ============================================================================
// Recordings (録画)
// ============================================================================

export const DEMO_RECORDINGS: DemoRecording[] = [
  {
    id: 'demo-r-001',
    title: '田中商事 / 年度更新ミーティング',
    meetingId: 'demo-m-001',
    recordedAt: '2026-05-07T14:00:00+09:00',
    durationSec: 2_712, // 45m12s
    transcriptExcerpt:
      '中村: 「昨年実績で 60 ライセンス使い切ったので、来期は 90 で組みたい。ただし 3 年契約にできるなら、価格面で何か工夫してもらえないかと思っています」鈴木: 「3 年契約の場合の特別単価は社内で確認できますので、5/13 までに見積書をお送りします」',
    aiSummary:
      '拡張ライセンス商談。3 年契約での価格調整に前向きな雰囲気。導入支援 SLA は維持。',
    speakerSplit: [
      { name: '鈴木 美咲', pct: 42 },
      { name: '中村 一郎', pct: 58 },
    ],
    sentimentCurve: [55, 60, 68, 72, 70, 75, 80, 78, 82, 85, 88, 86],
    highlights: [
      { atSec: 180, label: '昨年実績の振り返り' },
      { atSec: 421, label: '3 年契約の価格相談' },
      { atSec: 1820, label: 'SLA の据え置き確認' },
      { atSec: 2480, label: '5/13 期限の見積書送付に合意' },
    ],
  },
  {
    id: 'demo-r-002',
    title: 'フェニックス田中 / POC 評価レビュー',
    meetingId: 'demo-m-002',
    recordedAt: '2026-05-02T10:00:00+09:00',
    durationSec: 3_628, // 60m28s
    transcriptExcerpt:
      '小林: 「機能には満足してます。ただ、うちは内製チームが小さいので、組み込みに 2 ヶ月かかるとなると、今期の予算では難しい」田中: 「組み込みのテンプレ事例を 1 枚にまとめて、後ほどお送りします。下期に再開できるよう、こちらでもタイミングを探ります」',
    aiSummary:
      'POC の結果は良好だが、今期の予算枯渇で再検討は下期。組み込み工数への懸念が決定要因。',
    speakerSplit: [
      { name: '田中 健太郎', pct: 38 },
      { name: '小林 恵', pct: 62 },
    ],
    sentimentCurve: [65, 70, 72, 68, 60, 52, 48, 50, 55, 58, 60, 62],
    highlights: [
      { atSec: 240, label: 'POC の評価結果共有 (好評)' },
      { atSec: 1135, label: '組み込み工数の懸念表明' },
      { atSec: 2210, label: '下期再検討の合意' },
    ],
  },
  {
    id: 'demo-r-003',
    title: 'ナチュラルプレイ / 初回ヒアリング',
    meetingId: 'demo-m-003',
    recordedAt: '2026-05-06T15:30:00+09:00',
    durationSec: 3_015, // 50m15s
    transcriptExcerpt:
      '加藤: 「営業の知見が個人に貼り付いてるんですよね。誰かが辞めると、商談の経緯ごと消える。それが一番怖い」松本: 「録画は撮ってるんですが、検索できないので、結局誰も見返さない。要約だけでもまずほしいです」鈴木: 「30 日トライアルで、過去 1 ヶ月の Zoom 録画から自動で蓄積していけます」',
    aiSummary:
      '初回ヒアリング。属人化と「言った言わない」が経営課題。録画要約 + 検索のデモに強い関心。',
    speakerSplit: [
      { name: '鈴木 美咲', pct: 35 },
      { name: '加藤 美咲', pct: 38 },
      { name: '松本 健', pct: 27 },
    ],
    sentimentCurve: [50, 55, 62, 70, 75, 78, 80, 82, 83, 84, 85, 86],
    highlights: [
      { atSec: 320, label: '属人化への危機感を吐露' },
      { atSec: 612, label: '事例 PDF の送付を約束' },
      { atSec: 1480, label: '録画検索のデモで「あ、これ」反応' },
      { atSec: 2104, label: '権限管理の Q&A を次回までに準備' },
      { atSec: 2780, label: '30 日トライアルの段取り合意' },
    ],
  },
];

// ============================================================================
// Lookup helpers — pages がコードからアクセスしやすいよう小さい API を提供
// ============================================================================

export function findMember(id: string): DemoMember | undefined {
  return DEMO_MEMBERS.find((m) => m.id === id);
}

export function findContact(id: string): DemoContact | undefined {
  return DEMO_CONTACTS.find((c) => c.id === id);
}

export function findMeeting(id: string): DemoMeeting | undefined {
  return DEMO_MEETINGS.find((m) => m.id === id);
}

export function findRecording(id: string): DemoRecording | undefined {
  return DEMO_RECORDINGS.find((r) => r.id === id);
}

export const STAGE_LABELS: Record<DemoMeetingStage, string> = {
  scheduled: '予定',
  in_progress: '進行中',
  won: '受注',
  lost: '失注',
  on_hold: '保留',
};

export const CONTACT_STATUS_LABELS: Record<DemoContactStatus, string> = {
  verified: '確定',
  pending_review: '要確認',
  duplicate_suspect: '重複候補',
};

export const ROLE_LABELS: Record<DemoRole, string> = {
  admin: '管理者',
  manager: 'マネージャー',
  member: 'メンバー',
};

export function formatJpy(n: number): string {
  if (n === 0) return '—';
  return new Intl.NumberFormat('ja-JP', {
    style: 'currency',
    currency: 'JPY',
    maximumFractionDigits: 0,
  }).format(n);
}

export function formatDateJp(iso: string, withTime = false): string {
  const d = new Date(iso);
  const fmt = new Intl.DateTimeFormat('ja-JP', {
    month: 'short',
    day: 'numeric',
    weekday: 'short',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  });
  return fmt.format(d);
}

export function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}分${s.toString().padStart(2, '0')}秒`;
}

export function formatTimestamp(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/**
 * 相対日付フォーマッタ。SSR で安定したレンダリングのため、`now` は呼び出し側で
 * 固定値を渡すこと (例: ページ top で `const NOW = new Date('2026-05-11')`)。
 * default を使うとリクエストごとに値が揺れ、hydration 警告を誘発する。
 */
export function relativeDayJp(iso: string, now: Date): string {
  const d = new Date(iso);
  const days = Math.round((d.getTime() - now.getTime()) / 86_400_000);
  const rtf = new Intl.RelativeTimeFormat('ja-JP', { numeric: 'auto' });
  if (Math.abs(days) >= 30) {
    return new Intl.DateTimeFormat('ja-JP', { month: 'short', day: 'numeric' }).format(d);
  }
  return rtf.format(days, 'day');
}

/**
 * `now` 以降で最も早い (= 直近の) 予定された商談。
 * fixtures は時系列順ではないため、表示前に必ずこの関数で並べ替える。
 */
export function nextUpcomingMeeting(now: Date): DemoMeeting | undefined {
  const upcoming = DEMO_MEETINGS
    .filter((m) => m.stage === 'scheduled' && new Date(m.scheduledAt) >= now)
    .sort((a, b) => +new Date(a.scheduledAt) - +new Date(b.scheduledAt));
  return upcoming[0];
}
