import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AdminRole, useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { apiFetch } from "@/lib/api";

const PIN_LENGTH = 4;

export default function LoginScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { login, isAuthenticated } = useAuth();

  const [roles, setRoles] = useState<AdminRole[]>([]);
  const [loadingRoles, setLoadingRoles] = useState(true);
  const [selectedRole, setSelectedRole] = useState<AdminRole | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      router.replace("/(tabs)");
    }
  }, [isAuthenticated]);

  useEffect(() => {
    apiFetch<AdminRole[]>("/api/admin-roles")
      .then((data) => setRoles(data))
      .catch(() => setError("فشل تحميل المستخدمين"))
      .finally(() => setLoadingRoles(false));
  }, []);

  const handleDigit = (d: string) => {
    if (pin.length >= PIN_LENGTH) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const next = pin + d;
    setPin(next);
    setError("");
    if (next.length === PIN_LENGTH) {
      handleSubmit(next);
    }
  };

  const handleDelete = () => {
    if (!pin.length) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPin((p) => p.slice(0, -1));
    setError("");
  };

  const handleSubmit = async (code: string) => {
    if (!selectedRole) return;
    setSubmitting(true);
    try {
      await login(selectedRole.name, code);
      router.replace("/(tabs)");
    } catch (e: any) {
      setError(e.message ?? "رقم PIN غير صحيح");
      setPin("");
    } finally {
      setSubmitting(false);
    }
  };

  const s = styles(colors, insets);

  if (loadingRoles) {
    return (
      <View style={[s.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (!selectedRole) {
    return (
      <View style={[s.root, { backgroundColor: colors.background }]}>
        <View style={s.header}>
          <Image
            source={require("../assets/images/icon.png")}
            style={s.logo}
            contentFit="contain"
          />
          <Text style={[s.title, { color: colors.foreground }]}>PREGA SQUAD</Text>
          <Text style={[s.subtitle, { color: colors.mutedForeground }]}>
            اختر مستخدماً لتسجيل الدخول
          </Text>
        </View>
        {error ? (
          <Text style={[s.errorText, { color: colors.destructive }]}>{error}</Text>
        ) : null}
        <FlatList
          data={roles}
          keyExtractor={(r) => String(r.id)}
          numColumns={2}
          contentContainerStyle={s.roleGrid}
          columnWrapperStyle={s.roleRow}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[s.roleCard, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                setSelectedRole(item);
              }}
              activeOpacity={0.75}
            >
              <View style={[s.avatar, { backgroundColor: colors.accent }]}>
                {item.photoUrl ? (
                  <Image source={{ uri: item.photoUrl }} style={s.avatarImg} contentFit="cover" />
                ) : (
                  <Feather name="user" size={28} color={colors.primary} />
                )}
              </View>
              <Text style={[s.roleName, { color: colors.foreground }]} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={[s.roleLabel, { color: colors.mutedForeground }]} numberOfLines={1}>
                {item.role === "owner" ? "مالك" : item.role === "manager" ? "مدير" : "موظف"}
              </Text>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <Text style={[s.empty, { color: colors.mutedForeground }]}>
              لم يتم إعداد مستخدمين بعد
            </Text>
          }
        />
      </View>
    );
  }

  const dots = Array.from({ length: PIN_LENGTH }, (_, i) => i < pin.length);

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      <View style={s.header}>
        <Image
          source={require("../assets/images/icon.png")}
          style={s.logo}
          contentFit="contain"
        />
        <TouchableOpacity
          style={s.backRow}
          onPress={() => { setSelectedRole(null); setPin(""); setError(""); }}
        >
          <View style={[s.avatar, { backgroundColor: colors.accent }]}>
            {selectedRole.photoUrl ? (
              <Image source={{ uri: selectedRole.photoUrl }} style={s.avatarImg} contentFit="cover" />
            ) : (
              <Feather name="user" size={28} color={colors.primary} />
            )}
          </View>
        </TouchableOpacity>
        <Text style={[s.title, { color: colors.foreground }]}>{selectedRole.name}</Text>
        <Text style={[s.subtitle, { color: colors.mutedForeground }]}>أدخل رقم PIN</Text>
      </View>

      <View style={s.dotsRow}>
        {dots.map((filled, i) => (
          <View
            key={i}
            style={[
              s.dot,
              { borderColor: colors.primary },
              filled && { backgroundColor: colors.primary },
            ]}
          />
        ))}
      </View>

      {error ? (
        <Text style={[s.errorText, { color: colors.destructive }]}>{error}</Text>
      ) : null}

      {submitting ? (
        <ActivityIndicator color={colors.primary} style={{ marginVertical: 24 }} />
      ) : (
        <View style={s.numpad}>
          {["1","2","3","4","5","6","7","8","9","","0","⌫"].map((key, i) => (
            <TouchableOpacity
              key={i}
              style={[
                s.numKey,
                { backgroundColor: key === "" ? "transparent" : colors.card, borderColor: colors.border },
                key === "⌫" && { backgroundColor: colors.secondary },
              ]}
              onPress={() => key === "⌫" ? handleDelete() : key !== "" ? handleDigit(key) : null}
              disabled={key === ""}
              activeOpacity={0.7}
            >
              <Text style={[
                s.numText,
                { color: key === "⌫" ? colors.mutedForeground : colors.foreground },
              ]}>
                {key}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = (c: ReturnType<typeof useColors>, insets: ReturnType<typeof useSafeAreaInsets>) =>
  StyleSheet.create({
    root: {
      flex: 1,
      paddingTop: insets.top + (Platform.OS === "web" ? 60 : 0),
      paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 0),
      paddingHorizontal: 20,
    },
    center: { flex: 1, alignItems: "center", justifyContent: "center" },
    header: { alignItems: "center", marginBottom: 24 },
    logo: { width: 72, height: 72, borderRadius: 36, marginBottom: 12 },
    title: { fontSize: 22, fontWeight: "700" as const, marginBottom: 4 },
    subtitle: { fontSize: 14 },
    backRow: { marginBottom: 8 },
    avatar: {
      width: 64, height: 64, borderRadius: 32,
      alignItems: "center", justifyContent: "center", overflow: "hidden",
    },
    avatarImg: { width: 64, height: 64, borderRadius: 32 },
    roleGrid: { paddingBottom: 20 },
    roleRow: { justifyContent: "space-between", marginBottom: 12 },
    roleCard: {
      flex: 0.48, borderRadius: 16, borderWidth: 1,
      padding: 16, alignItems: "center", gap: 8,
    },
    roleName: { fontSize: 15, fontWeight: "600" as const, textAlign: "center" },
    roleLabel: { fontSize: 12 },
    empty: { textAlign: "center", marginTop: 40, fontSize: 15 },
    dotsRow: {
      flexDirection: "row", justifyContent: "center", gap: 16, marginBottom: 24,
    },
    dot: {
      width: 18, height: 18, borderRadius: 9, borderWidth: 2,
    },
    errorText: { textAlign: "center", marginBottom: 12, fontSize: 14 },
    numpad: {
      flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 12,
    },
    numKey: {
      width: 80, height: 80, borderRadius: 40, borderWidth: 1,
      alignItems: "center", justifyContent: "center",
    },
    numText: { fontSize: 24, fontWeight: "500" as const },
  });
