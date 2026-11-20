import {
  Activity as LucideActivity,
  AlertCircle as LucideAlertCircle,
  Archive as LucideArchive,
  ArrowDown as LucideArrowDown,
  ArrowUp as LucideArrowUp,
  ArrowUpRight as LucideArrowUpRight,
  BarChart3 as LucideBarChart3,
  CalendarDays as LucideCalendarDays,
  Check as LucideCheck,
  CheckCircle2 as LucideCheckCircle2,
  ChevronDown as LucideChevronDown,
  ChevronLeft as LucideChevronLeft,
  ChevronRight as LucideChevronRight,
  Circle as LucideCircle,
  Clock3 as LucideClock3,
  Download as LucideDownload,
  FileText as LucideFileText,
  Flag as LucideFlag,
  FolderKanban as LucideFolderKanban,
  LayoutDashboard as LucideLayoutDashboard,
  ListTodo as LucideListTodo,
  LoaderCircle as LucideLoaderCircle,
  MessageSquare as LucideMessageSquare,
  Plus as LucidePlus,
  RotateCcw as LucideRotateCcw,
  Search as LucideSearch,
  Settings2 as LucideSettings2,
  Sparkles as LucideSparkles,
  Target as LucideTarget,
  Trash2 as LucideTrash2,
  Upload as LucideUpload,
  User as LucideUser,
  X as LucideX,
  Zap as LucideZap,
} from 'lucide-react';

export type IconName =
  | 'today' | 'goals' | 'projects' | 'habits' | 'review'
  | 'add' | 'check' | 'close' | 'arrow-up' | 'arrow-down' | 'arrow-up-right'
  | 'calendar' | 'download' | 'upload' | 'flag' | 'activity' | 'archive'
  | 'list' | 'search' | 'settings' | 'trash' | 'spark' | 'target' | 'clock'
  | 'circle' | 'chevron-down' | 'chevron-left' | 'chevron-right' | 'spinner' | 'alert' | 'zap' | 'user'
  | 'file-text' | 'undo' | 'message';

type IconProps = { name: IconName; size?: number; className?: string };

const ICON_MAP = {
  today: LucideLayoutDashboard,
  goals: LucideTarget,
  projects: LucideFolderKanban,
  habits: LucideCheckCircle2,
  review: LucideBarChart3,
  add: LucidePlus,
  check: LucideCheck,
  close: LucideX,
  'arrow-up': LucideArrowUp,
  'arrow-down': LucideArrowDown,
  'arrow-up-right': LucideArrowUpRight,
  calendar: LucideCalendarDays,
  download: LucideDownload,
  upload: LucideUpload,
  flag: LucideFlag,
  activity: LucideActivity,
  archive: LucideArchive,
  list: LucideListTodo,
  search: LucideSearch,
  settings: LucideSettings2,
  trash: LucideTrash2,
  spark: LucideSparkles,
  target: LucideTarget,
  clock: LucideClock3,
  circle: LucideCircle,
  'chevron-down': LucideChevronDown,
  'chevron-left': LucideChevronLeft,
  'chevron-right': LucideChevronRight,
  spinner: LucideLoaderCircle,
  alert: LucideAlertCircle,
  zap: LucideZap,
  user: LucideUser,
  'file-text': LucideFileText,
  undo: LucideRotateCcw,
  message: LucideMessageSquare,
} as const;

export default function Icon({ name, size = 18, className = '' }: IconProps) {
  const Component = ICON_MAP[name];
  const classes = ['ip-icon', `ip-icon-${name}`, className].filter(Boolean).join(' ');
  return <Component size={size} strokeWidth={1.75} className={classes} aria-hidden="true" />;
}

export const Activity = LucideActivity;
export const Archive = LucideArchive;
export const ArrowDown = LucideArrowDown;
export const ArrowUp = LucideArrowUp;
export const ArrowUpRight = LucideArrowUpRight;
export const BarChart3 = LucideBarChart3;
export const CalendarDays = LucideCalendarDays;
export const Check = LucideCheck;
export const CheckCircle2 = LucideCheckCircle2;
export const ChevronDown = LucideChevronDown;
export const ChevronLeft = LucideChevronLeft;
export const ChevronRight = LucideChevronRight;
export const Circle = LucideCircle;
export const Clock3 = LucideClock3;
export const Download = LucideDownload;
export const FileText = LucideFileText;
export const Flag = LucideFlag;
export const FolderKanban = LucideFolderKanban;
export const LayoutDashboard = LucideLayoutDashboard;
export const ListTodo = LucideListTodo;
export const MessageSquare = LucideMessageSquare;
export const Plus = LucidePlus;
export const RotateCcw = LucideRotateCcw;
export const Search = LucideSearch;
export const Settings2 = LucideSettings2;
export const Sparkles = LucideSparkles;
export const Target = LucideTarget;
export const Trash2 = LucideTrash2;
export const Upload = LucideUpload;
export const X = LucideX;
export const User = LucideUser;
export const Zap = LucideZap;
export const LoaderCircle = LucideLoaderCircle;
export const AlertCircle = LucideAlertCircle;