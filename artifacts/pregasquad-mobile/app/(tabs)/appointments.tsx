import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import React, { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { apiFetch } from "@/lib/api";

interface Appointment {
  id: number;
  clientName?: string;
  clientId?: number;
  staffName?: string;
  staffId?: number;
  service?: string;
  startTime: string;
  endTime?: string;
  status: string;
  notes?: string;
  totalPrice?: number;
}

const STATUS_LABEL: Record<string, string> = {
  confirmed: "مؤكد",
  pending: "معلق",
  cancelled: "ملغى",
  completed: "مكتمل",
  no_show: "لم يحضر",
};

const STATUS_COLOR: Record<string, string> = {
  confirmed: "#22c55e",
  pending: "#f59e0b",
  cancelled: "#ef4444",
  completed: "#3b82f6",
  no_show: "#9ca3af",
};

type Filter = "today" | "week" | "all";

function filterLabel(f: Filter) {
  if (f === "today") return "اليوم";
  if (f === "week") return "هذا الأسبوع";
  return "الكل";
}

function formatDateTime(iso: string) {
  try {
    return new Date(iso).toLocaleString("ar-MA", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return iso;
  }
}

export default function AppointmentsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState<Filter>("today");

  const { data: appointments = [], isLoading, refetch, isRefetching } = useQuery<Appointment[]>({
    queryKey: ["appointments-all"],
    queryFn: () => apiFetch("/api/appointments"),
    staleTime: 30_000,
  });

  const filtered = appointments.filter((a) => {
    if (filter === "all") return true;
    const t = new Date(a.startTime);
    const now = new Date();
    if (filter === "today") {
      return t.toDateString() === now.toDateString();
    }
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);
    return t >= weekStart && t <= weekEnd;
  });

  const s = styles(colors, insets);

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      <View style={s.header}>
        <Text style={[s.title, { color: colors.foreground }]}>المواعيد</Text>
        <Text style={[s.count, { color: colors.mutedForeground }]}>{filtered.length} موعد</Text>
      </View>

      <View style={s.filterRow}>
        {(["today", "week", "all"] as Filter[]).map((f) => (
          <TouchableOpacity
            key={f}
            style={[
              s.filterBtn,
              { backgroundColor: filter === f ? colors.primary : colors.secondary, borderColor: colors.border },
            ]}
            onPress={() => setFilter(f)}
          >
            <Text style={[s.filterText, { color: filter === f ? "#fff" : colors.mutedForeground }]}>
              {filterLabel(f)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {isLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(a) => String(a.id)}
          contentContainerStyle={s.list}
          showsVerticalScrollIndicator={false}
          refreshing={isRefetching}
          onRefresh={refetch}
          scrollEnabled={filtered.length > 0}
          renderItem={({ item }) => (
            <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={s.cardTop}>
                <View style={[s.statusDot, { backgroundColor: STATUS_COLOR[item.status] ?? colors.mutedForeground }]} />
                <Text style={[s.clientName, { color: colors.foreground }]} numberOfLines={1}>
                  {item.clientName ?? `عميل #${item.clientId}`}
                </Text>
                <View style={[s.badge, { backgroundColor: (STATUS_COLOR[item.status] ?? "#999") + "22" }]}>
                  <Text style={[s.badgeText, { color: STATUS_COLOR[item.status] ?? colors.mutedForeground }]}>
                    {STATUS_LABEL[item.status] ?? item.status}
                  </Text>
                </View>
              </View>
              <View style={s.cardMeta}>
                <View style={s.metaItem}>
                  <Feather name="clock" size={12} color={colors.mutedForeground} />
                  <Text style={[s.metaText, { color: colors.mutedForeground }]}>
                    {formatDateTime(item.startTime)}
                  </Text>
                </View>
                {item.service ? (
                  <View style={s.metaItem}>
                    <Feather name="scissors" size={12} color={colors.mutedForeground} />
                    <Text style={[s.metaText, { color: colors.mutedForeground }]} numberOfLines={1}>
                      {item.service}
                    </Text>
                  </View>
                ) : null}
                {item.staffName ? (
                  <View style={s.metaItem}>
                    <Feather name="user" size={12} color={colors.mutedForeground} />
                    <Text style={[s.metaText, { color: colors.mutedForeground }]}>
                      {item.staffName}
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>
          )}
          ListEmptyComponent={
            <View style={s.empty}>
              <Feather name="calendar" size={48} color={colors.mutedForeground} />
              <Text style={[s.emptyText, { color: colors.mutedForeground }]}>لا توجد مواعيد</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = (c: ReturnType<typeof useColors>, insets: ReturnType<typeof useSafeAreaInsets>) =>
  StyleSheet.create({
    root: { flex: 1 },
    header: {
      paddingTop: insets.top + (Platform.OS === "web" ? 67 : 16),
      paddingHorizontal: 16,
      paddingBottom: 12,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    title: { fontSize: 24, fontWeight: "700" as const },
    count: { fontSize: 14 },
    filterRow: {
      flexDirection: "row", gap: 8, paddingHorizontal: 16, marginBottom: 12,
    },
    filterBtn: {
      paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1,
    },
    filterText: { fontSize: 13, fontWeight: "500" as const },
    list: {
      paddingHorizontal: 16,
      paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 100),
      gap: 10,
    },
    card: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 8 },
    cardTop: { flexDirection: "row", alignItems: "center", gap: 8 },
    statusDot: { width: 8, height: 8, borderRadius: 4 },
    clientName: { flex: 1, fontSize: 15, fontWeight: "600" as const },
    badge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20 },
    badgeText: { fontSize: 11, fontWeight: "600" as const },
    cardMeta: { gap: 4, paddingLeft: 16 },
    metaItem: { flexDirection: "row", alignItems: "center", gap: 6 },
    metaText: { fontSize: 12 },
    empty: { alignItems: "center", justifyContent: "center", paddingTop: 80, gap: 12 },
    emptyText: { fontSize: 15 },
  });
