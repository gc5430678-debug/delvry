import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  Alert,
  ScrollView,
  TextInput,
  Pressable,
  ActivityIndicator,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';

const BASE_URL = 'https://back-end-nodejs-production-fdc5.up.railway.app/api/delver';

const COLORS = {
  bg: '#0f0f2',
  card: '#1a1a2e',
  accent: '#00E5FF',
  accentDim: 'rgba(0, 229, 255, 0.15)',
  text: '#f1f5f9',
  textMuted: '#94a3b8',
  danger: '#ef4444',
  dangerDim: 'rgba(239, 68, 68, 0.15)',
};

export default function App() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [loggedIn, setLoggedIn] = useState(false);
  const [step, setStep] = useState('login');
  const [pin, setPin] = useState('');
  const [locationText, setLocationText] = useState('');
  const [tempRegion, setTempRegion] = useState<{ latitude: number; longitude: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const locationSubscription = useRef<any>(null);

  useEffect(() => {
    const checkUser = async () => {
      const savedEmail = await AsyncStorage.getItem('email');
      const savedName = await AsyncStorage.getItem('name');
      const savedPhone = await AsyncStorage.getItem('phone');
      const savedLocation = await AsyncStorage.getItem('location');
      if (savedEmail && savedName) {
        setEmail(savedEmail);
        setName(savedName);
        if (savedPhone) setPhone(savedPhone);
        setLoggedIn(true);
      }
      if (savedLocation) setLocationText(savedLocation);
    };
    checkUser();
  }, []);

  const getCurrentLocation = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('❌', 'تم رفض إذن الموقع');
      return;
    }
    try {
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const { latitude, longitude } = loc.coords;
      setTempRegion({ latitude, longitude });
      setLocationText(`${latitude.toFixed(5)}, ${longitude.toFixed(5)}`);
    } catch {
      Alert.alert(
        'الموقع غير متوفر',
        'تأكد من تفعيل خدمات الموقع (GPS) في إعدادات الجهاز ثم أعد المحاولة.'
      );
    }
  };

  const saveLocation = async (
    lat = tempRegion?.latitude,
    lng = tempRegion?.longitude
  ) => {
    if (!lat || !lng || !email) {
      Alert.alert('اختر موقعك أولاً');
      return;
    }
    try {
      const res = await fetch(`${BASE_URL}/update-location`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, latitude: lat, longitude: lng }),
      });
      const data = await res.json();
      if (data.success) {
        AsyncStorage.setItem('location', `${lat.toFixed(5)}, ${lng.toFixed(5)}`);
        setLocationText(`${lat.toFixed(5)}, ${lng.toFixed(5)}`);
      } else {
        Alert.alert(data.message);
      }
    } catch {
      Alert.alert('خطأ في السيرفر');
    }
  };

  const handleLogin = async () => {
    if (!name || !email || !phone)
      return Alert.alert('يرجى إدخال الاسم، الإيميل، ورقم الهاتف');
    setLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/re`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, phone }),
      });
      const data = await res.json();
      if (data.success) {
        setStep('verify');
        await AsyncStorage.setItem('phone', phone);
      } else {
        Alert.alert(data.message);
      }
    } catch {
      Alert.alert('خطأ في السيرفر');
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    if (!pin) return Alert.alert('ادخل رمز التحقق');
    setLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/ve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, pin }),
      });
      const data = await res.json();
      if (data.success) {
        await AsyncStorage.setItem('name', name);
        await AsyncStorage.setItem('email', email);
        setLoggedIn(true);
        setPin('');
        setStep('login');
      } else {
        Alert.alert(data.message);
      }
    } catch {
      Alert.alert('خطأ في التحقق');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await AsyncStorage.clear();
    setLoggedIn(false);
    setName('');
    setEmail('');
    setPhone('');
    setLocationText('');
    if (locationSubscription.current) locationSubscription.current.remove();
  };

  // ——— لوحة التحكم (بعد تسجيل الدخول) ———
  if (loggedIn) {
    return (
      <View style={styles.screen}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.headerCard}>
            <View style={styles.headerIconWrap}>
              <Ionicons name="bicycle" size={32} color={COLORS.accent} />
            </View>
            <Text style={styles.headerTitle}>تطبيق المندوب</Text>
            <Text style={styles.headerSub}>إدارة موقعك وحالة التوصيل</Text>
          </View>

          <View style={styles.card}>
            <View style={styles.cardTitleRow}>
              <Ionicons name="location-outline" size={22} color={COLORS.accent} />
              <Text style={styles.cardTitle}>موقعك الحالي</Text>
            </View>
            <Pressable style={styles.inputWrap} onPress={getCurrentLocation}>
              <TextInput
                placeholder="اضغط لاختيار موقعك من الخريطة"
                placeholderTextColor={COLORS.textMuted}
                value={locationText}
                style={styles.input}
                editable={false}
              />
              <Ionicons name="chevron-forward" size={20} color={COLORS.textMuted} />
            </Pressable>
          </View>

          <View style={styles.card}>
            <View style={styles.cardTitleRow}>
              <Ionicons name="call-outline" size={22} color={COLORS.accent} />
              <Text style={styles.cardTitle}>رقم الهاتف</Text>
            </View>
            <TextInput
              placeholder="رقم الهاتف"
              placeholderTextColor={COLORS.textMuted}
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              style={styles.input}
            />
          </View>

          <Pressable
            style={({ pressed }) => [styles.primaryBtn, pressed && styles.primaryBtnPressed]}
            onPress={() => saveLocation()}
          >
            <Ionicons name="save-outline" size={22} color="#0f0f23" />
            <Text style={styles.primaryBtnText}>حفظ الموقع</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.logoutBtn, pressed && styles.logoutBtnPressed]}
            onPress={handleLogout}
          >
            <Ionicons name="log-out-outline" size={22} color={COLORS.danger} />
            <Text style={styles.logoutBtnText}>تسجيل خروج</Text>
          </Pressable>
        </ScrollView>
      </View>
    );
  }

  // ——— شاشة التحقق ———
  if (step === 'verify') {
    return (
      <KeyboardAvoidingView
        style={styles.screen}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.centeredCard}>
          <View style={styles.verifyIconWrap}>
            <Ionicons name="shield-checkmark" size={48} color={COLORS.accent} />
          </View>
          <Text style={styles.verifyTitle}>رمز التحقق</Text>
          <Text style={styles.verifySub}>
            أدخل الرمز المرسل إلى هاتفك
          </Text>
          <TextInput
            placeholder="أدخل الرمز"
            placeholderTextColor={COLORS.textMuted}
            value={pin}
            onChangeText={setPin}
            keyboardType="numeric"
            maxLength={6}
            style={styles.pinInput}
          />
          <Pressable
            style={({ pressed }) => [
              styles.primaryBtn,
              styles.primaryBtnFull,
              pressed && styles.primaryBtnPressed,
            ]}
            onPress={handleVerify}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#0f0f23" />
            ) : (
              <>
                <Ionicons name="checkmark-circle-outline" size={22} color="#0f0f23" />
                <Text style={styles.primaryBtnText}>تحقق</Text>
              </>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    );
  }

  // ——— شاشة تسجيل الدخول ———
  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.loginScroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.loginHeader}>
          <View style={styles.loginIconWrap}>
            <Ionicons name="bicycle" size={40} color={COLORS.accent} />
          </View>
          <Text style={styles.loginTitle}>مرحباً بك</Text>
          <Text style={styles.loginSub}>سجّل دخولك كمندوب توصيل</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>الاسم</Text>
          <TextInput
            placeholder="أدخل اسمك"
            placeholderTextColor={COLORS.textMuted}
            value={name}
            onChangeText={setName}
            style={styles.input}
          />
          <Text style={styles.label}>البريد الإلكتروني</Text>
          <TextInput
            placeholder="example@email.com"
            placeholderTextColor={COLORS.textMuted}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            style={styles.input}
          />
          <Text style={styles.label}>رقم الهاتف</Text>
          <TextInput
            placeholder="07xxxxxxxx"
            placeholderTextColor={COLORS.textMuted}
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            style={styles.input}
          />
        </View>

        <Pressable
          style={({ pressed }) => [
            styles.primaryBtn,
            styles.primaryBtnFull,
            pressed && styles.primaryBtnPressed,
          ]}
          onPress={handleLogin}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#0f0f23" />
          ) : (
            <>
              <Ionicons name="log-in-outline" size={22} color="#0f0f23" />
              <Text style={styles.primaryBtnText}>تسجيل الدخول</Text>
            </>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  scrollContent: {
    padding: 20,
    paddingTop: 50,
    paddingBottom: 40,
  },
  loginScroll: {
    padding: 24,
    paddingTop: 60,
    paddingBottom: 40,
    flexGrow: 1,
    justifyContent: 'center',
  },
  headerCard: {
    backgroundColor: COLORS.card,
    borderRadius: 24,
    padding: 24,
    marginBottom: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0, 229, 255, 0.12)',
  },
  headerIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: COLORS.accentDim,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: 4,
  },
  headerSub: {
    fontSize: 14,
    color: COLORS.textMuted,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textMuted,
    marginBottom: 8,
    marginTop: 12,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: 'rgba(0, 229, 255, 0.2)',
  },
  input: {
    flex: 1,
    height: 52,
    color: COLORS.text,
    fontSize: 16,
    paddingVertical: 0,
  },
  pinInput: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 14,
    padding: 18,
    marginVertical: 20,
    color: COLORS.text,
    fontSize: 20,
    textAlign: 'center',
    letterSpacing: 8,
    borderWidth: 1,
    borderColor: 'rgba(0, 229, 255, 0.2)',
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.accent,
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 16,
    marginTop: 8,
    gap: 10,
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  primaryBtnFull: {
    width: '100%',
  },
  primaryBtnPressed: {
    opacity: 0.9,
  },
  primaryBtnText: {
    color: '#0f0f23',
    fontSize: 17,
    fontWeight: '800',
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.dangerDim,
    paddingVertical: 16,
    borderRadius: 16,
    marginTop: 24,
    gap: 10,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  logoutBtnPressed: {
    opacity: 0.9,
  },
  logoutBtnText: {
    color: COLORS.danger,
    fontSize: 16,
    fontWeight: '700',
  },
  centeredCard: {
    flex: 1,
    justifyContent: 'center',
    padding: 28,
  },
  verifyIconWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: COLORS.accentDim,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 20,
  },
  verifyTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: 8,
  },
  verifySub: {
    fontSize: 15,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginBottom: 8,
  },
  loginHeader: {
    alignItems: 'center',
    marginBottom: 32,
  },
  loginIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.accentDim,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  loginTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: 6,
  },
  loginSub: {
    fontSize: 15,
    color: COLORS.textMuted,
  },
});
