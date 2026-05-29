import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import React from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { apiFetch } from "@/lib/api";

interface StaffMember {
  id: number;
  name: string;
  role?: string;
  phone?: string;
  gender?: string;
  photoUrl?: string;
  commissionRate?: number;
  isActive?: boolean;
}

const ROLE_LABEL: Record<string, string> = {
  stylist: "حلاقة",
  nail_tech: "أظافر",
  esthetician: "تجميل",
  manager: "مديرة",
  receptionist: "استقبال",
};

export default function StaffScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const { data: staff = [], isLoading, refetch, isRefetching } = useQuery<StaffMember[]>({
    queryKey: ["staff"],
    queryFn: () => apiFetch("/api/staff"),
    staleTime: 60_000,
  });

  const active = staff.filter((s) => s.isActive !== false);

  const s = styles(colors, insets);

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      <View style={s.header}>
        <Text style={[s.title, { color: colors.foreground }]}>الموظفون</Text>
        <Text style={[s.count, { color: colors.mutedForeground }]}>{active.length} موظف</Text>
      </View>

      {isLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={active}
          keyExtractor={(m) => String(m.id)}
          numColumns={2}
          contentContainerStyle={s.grid}
          columnWrapperStyle={s.row}
          showsVerticalScrollIndicator={false}
          refreshing={isRefetching}
          onRefresh={refetch}
          scrollEnabled={!!active.length}
          renderItem={({ item }) => (
            <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[s.avatarWrap, { backgroundColor: colors.accent }]}>
                {item.photoUrl ? (
                  <Image
                    source={{ uri: item.photoUrl }}
                    style={s.avatarImg}
                    contentFit="cover"
                  />
                ) : (
                  <Feather name="user" size={32} color={colors.primary} />
                )}
              </View>
              <Text style={[s.name, { color: colors.foreground }]} numberOfLines={1}>
                {item.name}
              </Text>
              {item.role ? (
                <View style={[s.roleBadge, { backgroundColor: colors.secondary }]}>
                  <Text style={[s.roleText, { color: colors.primary }]}>
                    {ROLE_LABEL[item.role] ?? item.role}
                  </Text>
                </View>
              ) : null}
              {item.phone ? (
                <View style={s.phoneRow}>
                  <Feather name="phone" size={11} color={colors.mutedForeground} />
                  <Text style={[s.phone, { color: colors.mutedForeground }]} numberOfLines={1}>
                    {item.phone}
                  </Text>
                </View>
              ) : null}
            </View>
          )}
          ListEmptyComponent={
            <View style={s.empty}>
              <Feather name="users" size={48} color={colors.mutedForeground} />
              <Text style={[s.emptyText, { color: colors.mutedForeground }]}>لا يوجد موظفون</Text>
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
    grid: {
      paddingHorizontal: 12,
      paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 100),
      paddingTop: 4,
    },
    row: { justifyContent: "space-between", marginBottom: 12, paddingHorizontal: 4 },
    card: {
      flex: 0.48, borderRadius: 16, borderWidth: 1, padding: 16,
      alignItems: "center", gap: 8,
    },
    avatarWrap: {
      width: 72, height: 72, borderRadius: 36,
      alignItems: "center", justifyContent: "center", overflow: "hidden",
    },
    avatarImg: { width: 72, height: 72, borderRadius: 36 },
    name: { fontSize: 14, fontWeight: "600" as const, textAlign: "center" },
    roleBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
    roleText: { fontSize: 12, fontWeight: "500" as const },
    phoneRow: { flexDirection: "row", alignItems: "center", gap: 4 },
    phone: { fontSize: 11 },
    empty: { alignItems: "center", justifyContent: "center", paddingTop: 80, gap: 12 },
    emptyText: { fontSize: 15 },
  });
