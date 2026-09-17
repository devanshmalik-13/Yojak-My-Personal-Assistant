export const CURRENT_SCHEMA_VERSION = 6;

export const DEFAULT_TIMEZONE = "Asia/Kolkata";

export const DEFAULT_CATEGORIES = [
  { id: "default-food", name: "Food", icon: "🍜", type: "expense", color: "#F97316" },
  { id: "default-transport", name: "Transport", icon: "🚌", type: "expense", color: "#3B82F6" },
  { id: "default-education", name: "Education", icon: "🎓", type: "expense", color: "#8B5CF6" },
  { id: "default-entertainment", name: "Entertainment", icon: "🎮", type: "expense", color: "#EC4899" },
  { id: "default-shopping", name: "Shopping", icon: "🛍️", type: "expense", color: "#10B981" },
  { id: "default-bills", name: "Bills", icon: "🧾", type: "expense", color: "#F59E0B" },
  { id: "default-other", name: "Other", icon: "📦", type: "expense", color: "#6B7280" },
  { id: "default-cash-income", name: "Cash", icon: "💵", type: "income", color: "#16A34A" },
  { id: "default-online-income", name: "Online", icon: "🏦", type: "income", color: "#0EA5E9" },
  { id: "default-scholarship", name: "Scholarship", icon: "🎓", type: "income", color: "#D946EF" },
] as const;
