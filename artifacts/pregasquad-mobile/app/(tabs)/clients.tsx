import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { apiFetch } from "@/lib/api";

interface Client {
  id: number;
  name: string;
  phone?: string;
  email?: string;
  notes?: string;
  totalVisits?: number;
  loyaltyPoints?: number;
  lastVisit?: string;
}

function formatDate(iso?: string) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString("ar-MA", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

export default function ClientsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState("");

  const { data: clients = [], isLoading, refetch, isRefetching } = useQuery<Client[]>({
    queryKey: ["clients"],
    queryFn: () => apiFetch("/api/clients"),
    staleTime: 60_000,
  });

  const filtered = useMemo(() => {
    if (!search.trim()) return clients;
    const q = search.trim().toLowerCase();
    return clients.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.phone?.includes(q) ||
        c.email?.toLowerCase().includes(q)
    );
  }, [clients, search]);

  const s = styles(colors, insets);

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      <View style={s.header}>
        <Text style={[s.title, { color: colors.foreground }]}>العملاء</Text>
        <Text style={[s.count, { color: colors.mutedForeground }]}>{clients.length} عميل</Text>
      </View>

      <View style={[s.searchBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Feather name="search" size={16} color={colors.mutedForeground} />
        <TextInput
          style={[s.searchInput, { color: colors.foreground }]}
          placeholder="ابحث باسم أو هاتف..."
          placeholderTextColor={colors.mutedForeground}
          value={search}
          onChangeText={setSearch}
          clearButtonMode="while-editing"
        />
        {search ? (
          <TouchableOpacity onPress={() => setSearch("")}>
            <Feather name="x" size={16} color={colors.mutedForeground} />
          </TouchableOpacity>
        ) : null}
      </View>

      {isLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(c) => String(c.id)}
          contentContainerStyle={s.list}
          showsVerticalScrollIndicator={false}
          refreshing={isRefetching}
          onRefresh={refetch}
          scrollEnabled={!!filtered.length}
          renderItem={({ item }) => (
            <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[s.avatar, { backgroundColor: colors.accent }]}>
                <Text style={[s.avatarText, { color: colors.primary }]}>
                  {item.name.charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={s.info}>
                <Text style={[s.name, { color: colors.foreground }]} numberOfLines={1}>
                  {item.name}
                </Text>
                {item.phone ? (
                  <View style={s.metaRow}>
                    <Feather name="phone" size={11} color={colors.mutedForeground} />
                    <Text style={[s.meta, { color: colors.mutedForeground }]}>{item.phone}</Text>
                  </View>
                ) : null}
                {item.lastVisit ? (
                  <View style={s.metaRow}>
                    <Feather name="calendar" size={11} color={colors.mutedForeground} />
                    <Text style={[s.meta, { color: colors.mutedForeground }]}>
                      آخر زيارة: {formatDate(item.lastVisit)}
                    </Text>
                  </View>
                ) : null}
              </View>
              {(item.totalVisits ?? 0) > 0 || (item.loyaltyPoints ?? 0) > 0 ? (
                <View style={s.badges}>
                  {(item.totalVisits ?? 0) > 0 ? (
                    <View style={[s.badge, { backgroundColor: colors.secondary }]}>
                      <Text style={[s.badgeText, { color: colors.primary }]}>
                        {item.totalVisits} زيارة
                      </Text>
                    </View>
                  ) : null}
                  {(item.loyaltyPoints ?? 0) > 0 ? (
                    <View style={[s.badge, { backgroundColor: "#fef9c3" }]}>
                      <Text style={[s.badgeText, { color: "#a16207" }]}>
                        ⭐ {item.loyaltyPoints}
                      </Text>
                    </View>
                  ) : null}
                </View>
              ) : null}
            </View>
          )}
          ListEmptyComponent={
            <View style={s.empty}>
              <Feather name="users" size={48} color={colors.mutedForeground} />
              <Text style={[s.emptyText, { color: colors.mutedForeground }]}>
                {search ? "لا توجد نتائج" : "لا يوجد عملاء بعد"}
              </Text>
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
    searchBox: {
      marginHorizontal: 16, marginBottom: 12, borderRadius: 12, borderWidth: 1,
      flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 10, gap: 8,
    },
    searchInput: { flex: 1, fontSize: 14 },
    list: {
      paddingHorizontal: 16,
      paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 100),
      gap: 10,
    },
    card: {
      borderRadius: 14, borderWidth: 1, padding: 14,
      flexDirection: "row", alignItems: "center", gap: 12,
    },
    avatar: {
      width: 48, height: 48, borderRadius: 24,
      alignItems: "center", justifyContent: "center",
    },
    avatarText: { fontSize: 20, fontWeight: "700" as const },
    info: { flex: 1, gap: 3 },
    name: { fontSize: 15, fontWeight: "600" as const },
    metaRow: { flexDirection: "row", alignItems: "center", gap: 4 },
    meta: { fontSize: 12 },
    badges: { gap: 4, alignItems: "flex-end" },
    badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
    badgeText: { fontSize: 11, fontWeight: "600" as const },
    empty: { alignItems: "center", justifyContent: "center", paddingTop: 80, gap: 12 },
    emptyText: { fontSize: 15 },
  });
