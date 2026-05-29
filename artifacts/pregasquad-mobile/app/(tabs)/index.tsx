import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
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
}

interface BusinessSettings {
  businessName?: string;
  currency?: string;
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

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString("ar-MA", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return iso;
  }
}

function todayRange() {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const router = useRouter();

  const { data: settings } = useQuery<BusinessSettings>({
    queryKey: ["business-settings-public"],
    queryFn: () => apiFetch("/api/public/settings"),
    staleTime: 60_000,
  });

  const { data: appointments = [], isLoading } = useQuery<Appointment[]>({
    queryKey: ["appointments-today"],
    queryFn: () => apiFetch("/api/appointments"),
    staleTime: 30_000,
  });

  const { start, end } = todayRange();
  const todayAppts = appointments.filter((a) => {
    const t = new Date(a.startTime).getTime();
    return t >= start.getTime() && t <= end.getTime();
  });

  const confirmed = todayAppts.filter((a) => a.status === "confirmed").length;
  const pending = todayAppts.filter((a) => a.status === "pending").length;
  const completed = todayAppts.filter((a) => a.status === "completed").length;

  const todayStr = new Date().toLocaleDateString("ar-MA", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const s = styles(colors, insets);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={s.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={s.topHeader}>
        <View>
          <Text style={[s.greeting, { color: colors.mutedForeground }]}>{todayStr}</Text>
          <Text style={[s.salonName, { color: colors.foreground }]}>
            {settings?.businessName ?? "PREGA SQUAD"}
          </Text>
        </View>
        <TouchableOpacity
          style={[s.logoutBtn, { backgroundColor: colors.secondary }]}
          onPress={logout}
        >
          <Feather name="log-out" size={18} color={colors.mutedForeground} />
        </TouchableOpacity>
      </View>

      {/* Welcome card */}
      <View style={[s.welcomeCard, { backgroundColor: colors.primary }]}>
        <Text style={s.welcomeText}>مرحباً، {user?.userName ?? ""}!</Text>
        <Text style={s.welcomeSub}>
          {todayAppts.length > 0
            ? `لديك ${todayAppts.length} موعد اليوم`
            : "لا توجد مواعيد اليوم"}
        </Text>
      </View>

      {/* Stats row */}
      <View style={s.statsRow}>
        {[
          { label: "مؤكدة", value: confirmed, color: "#22c55e" },
          { label: "معلقة", value: pending, color: "#f59e0b" },
          { label: "مكتملة", value: completed, color: "#3b82f6" },
        ].map((stat) => (
          <View
            key={stat.label}
            style={[s.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <Text style={[s.statVal, { color: stat.color }]}>{stat.value}</Text>
            <Text style={[s.statLabel, { color: colors.mutedForeground }]}>{stat.label}</Text>
          </View>
        ))}
      </View>

      {/* Today's appointments */}
      <View style={s.section}>
        <View style={s.sectionHeader}>
          <Text style={[s.sectionTitle, { color: colors.foreground }]}>مواعيد اليوم</Text>
          <TouchableOpacity onPress={() => router.push("/(tabs)/appointments")}>
            <Text style={[s.seeAll, { color: colors.primary }]}>عرض الكل</Text>
          </TouchableOpacity>
        </View>

        {isLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />
        ) : todayAppts.length === 0 ? (
          <View style={[s.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Feather name="calendar" size={36} color={colors.mutedForeground} />
            <Text style={[s.emptyText, { color: colors.mutedForeground }]}>لا توجد مواعيد اليوم</Text>
          </View>
        ) : (
          todayAppts.slice(0, 5).map((appt) => (
            <View
              key={appt.id}
              style={[s.apptCard, { backgroundColor: colors.card, borderColor: colors.border }]}
            >
              <View style={[s.apptTime, { backgroundColor: colors.secondary }]}>
                <Text style={[s.apptTimeText, { color: colors.primary }]}>
                  {formatTime(appt.startTime)}
                </Text>
              </View>
              <View style={s.apptInfo}>
                <Text style={[s.apptClient, { color: colors.foreground }]} numberOfLines={1}>
                  {appt.clientName ?? `عميل #${appt.clientId}`}
                </Text>
                <Text style={[s.apptService, { color: colors.mutedForeground }]} numberOfLines={1}>
                  {appt.service ?? "خدمة"}
                </Text>
              </View>
              <View style={[s.badge, { backgroundColor: STATUS_COLOR[appt.status] + "22" }]}>
                <Text style={[s.badgeText, { color: STATUS_COLOR[appt.status] ?? colors.mutedForeground }]}>
                  {STATUS_LABEL[appt.status] ?? appt.status}
                </Text>
              </View>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = (c: ReturnType<typeof useColors>, insets: ReturnType<typeof useSafeAreaInsets>) =>
  StyleSheet.create({
    content: {
      paddingTop: insets.top + (Platform.OS === "web" ? 67 : 16),
      paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 100),
      paddingHorizontal: 16,
      gap: 16,
    },
    topHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
    greeting: { fontSize: 12, marginBottom: 2 },
    salonName: { fontSize: 22, fontWeight: "700" as const },
    logoutBtn: { padding: 10, borderRadius: 24 },
    welcomeCard: {
      borderRadius: 20, padding: 20, gap: 6,
    },
    welcomeText: { color: "#fff", fontSize: 18, fontWeight: "700" as const },
    welcomeSub: { color: "rgba(255,255,255,0.85)", fontSize: 14 },
    statsRow: { flexDirection: "row", gap: 10 },
    statCard: {
      flex: 1, borderRadius: 14, borderWidth: 1,
      padding: 14, alignItems: "center", gap: 4,
    },
    statVal: { fontSize: 28, fontWeight: "700" as const },
    statLabel: { fontSize: 12 },
    section: { gap: 10 },
    sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    sectionTitle: { fontSize: 17, fontWeight: "600" as const },
    seeAll: { fontSize: 13, fontWeight: "500" as const },
    emptyCard: {
      borderRadius: 16, borderWidth: 1, padding: 32,
      alignItems: "center", gap: 12,
    },
    emptyText: { fontSize: 14 },
    apptCard: {
      borderRadius: 14, borderWidth: 1, padding: 12,
      flexDirection: "row", alignItems: "center", gap: 12,
    },
    apptTime: { borderRadius: 10, padding: 10, alignItems: "center", minWidth: 56 },
    apptTimeText: { fontSize: 12, fontWeight: "600" as const },
    apptInfo: { flex: 1, gap: 2 },
    apptClient: { fontSize: 14, fontWeight: "600" as const },
    apptService: { fontSize: 12 },
    badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
    badgeText: { fontSize: 11, fontWeight: "600" as const },
  });
