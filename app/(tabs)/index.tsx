import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  Alert,
  ScrollView,
  TextInput,
  Pressable,
  Modal,
  ActivityIndicator
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { WebView } from 'react-native-webview';

const BASE_URL = "https://back-end-nodejs-production-fdc5.up.railway.app/api/delver";

export default function App() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');

  // ✅ إضافة رقم الهاتف
  const [phone, setPhone] = useState('');

  const [loggedIn, setLoggedIn] = useState(false);
  const [step, setStep] = useState('login');
  const [pin, setPin] = useState('');

  const [locationText, setLocationText] = useState('');
  const [tempRegion, setTempRegion] = useState(null);
  const [mapVisible, setMapVisible] = useState(false);
  const [loading, setLoading] = useState(false);

  const locationSubscription = useRef(null);

  // ================= CHECK LOGIN =================
  useEffect(() => {
    const checkUser = async () => {
      const savedEmail = await AsyncStorage.getItem('email');
      const savedName = await AsyncStorage.getItem('name');
      const savedPhone = await AsyncStorage.getItem('phone'); // ✅
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

  // ================= GET CURRENT LOCATION =================
  const getCurrentLocation = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('❌', 'تم رفض إذن الموقع');
      return;
    }

    try {
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced
      });
      const { latitude, longitude } = loc.coords;

      setTempRegion({ latitude, longitude });
      setLocationText(`${latitude.toFixed(5)}, ${longitude.toFixed(5)}`);
      setMapVisible(true);
    } catch (err) {
      Alert.alert(
        'الموقع غير متوفر',
        'تأكد من تفعيل خدمات الموقع (GPS) في إعدادات الجهاز ثم أعد المحاولة.'
      );
    }
  };

  // ================= SAVE LOCATION =================
  const saveLocation = async (lat = tempRegion?.latitude, lng = tempRegion?.longitude) => {
    if (!lat || !lng || !email) {
      Alert.alert('اختر موقعك أولاً');
      return;
    }

    try {
      const res = await fetch(`${BASE_URL}/update-location`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, latitude: lat, longitude: lng })
      });

      const data = await res.json();

      if (data.success) {
        AsyncStorage.setItem('location', `${lat.toFixed(5)}, ${lng.toFixed(5)}`);
        setLocationText(`${lat.toFixed(5)}, ${lng.toFixed(5)}`);
      } else {
        Alert.alert(data.message);
      }
    } catch (err) {
      Alert.alert('خطأ في السيرفر');
    }
  };

  // ================= LOGIN =================
  const handleLogin = async () => {
    if (!name || !email || !phone)
      return Alert.alert('يرجى إدخال الاسم، الإيميل، ورقم الهاتف');

    setLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/re`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },

        // ✅ إرسال رقم الهاتف
        body: JSON.stringify({ name, email, phone }),
      });

      const data = await res.json();
      if (data.success) {
        setStep('verify');
        await AsyncStorage.setItem('phone', phone); // ✅ حفظ محلي
      } else {
        Alert.alert(data.message);
      }
    } catch {
      Alert.alert('خطأ في السيرفر');
    } finally {
      setLoading(false);
    }
  };

  // ================= VERIFY =================
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

  // ================= LOGOUT =================
  const handleLogout = async () => {
    await AsyncStorage.clear();
    setLoggedIn(false);
    setName('');
    setEmail('');
    setPhone('');
    setLocationText('');
    if (locationSubscription.current) locationSubscription.current.remove();
  };

  // ================= UI (LOGGED IN) =================
  if (loggedIn) {
    return (
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 50 }}>
        <Text style={{ fontSize: 18, fontWeight: 'bold' }}>📲 تطبيق المندوب</Text>

        {/* الموقع */}
        <Pressable onPress={getCurrentLocation}>
          <TextInput
            placeholder="اختر موقعك من الخريطة"
            value={locationText}
            style={{
              borderWidth: 1,
              borderColor: '#00E5FF',
              padding: 12,
              borderRadius: 8,
              marginTop: 15,
              textAlign: 'center'
            }}
            editable={false}
          />
        </Pressable>

        {/* ✅ رقم الهاتف تحت الموقع */}
        <TextInput
          placeholder="رقم الهاتف"
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          style={{
            borderWidth: 1,
            borderColor: '#00E5FF',
            padding: 12,
            borderRadius: 8,
            marginTop: 10,
            textAlign: 'center'
          }}
        />

        <Pressable
          onPress={() => saveLocation()}
          style={{
            backgroundColor: '#00E5FF',
            padding: 15,
            borderRadius: 10,
            marginTop: 15,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: '#fff', fontWeight: 'bold' }}>💾 حفظ الموقع</Text>
        </Pressable>

        <Pressable
          onPress={handleLogout}
          style={{
            backgroundColor: '#ef4444',
            padding: 15,
            borderRadius: 10,
            marginTop: 20,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: '#fff', fontWeight: 'bold' }}>تسجيل خروج</Text>
        </Pressable>
      </ScrollView>
    );
  }

  // ================= VERIFY UI =================
  if (step === 'verify') {
    return (
      <View style={{ flex: 1, backgroundColor: '#1e1b4b', justifyContent: 'center', padding: 20 }}>
        <Text style={{ color: '#00E5FF', fontSize: 24, fontWeight: 'bold', textAlign: 'center' }}>
          رمز التحقق
        </Text>

        <TextInput
          placeholder="ادخل رمز التحقق"
          placeholderTextColor="#aaa"
          style={{ backgroundColor: 'rgba(255,255,255,0.1)', color: '#fff', borderRadius: 10, padding: 15, marginVertical: 15 }}
          value={pin}
          onChangeText={setPin}
          keyboardType="numeric"
        />

        <Pressable onPress={handleVerify} style={{ backgroundColor: '#00E5FF', padding: 15, borderRadius: 10 }}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', textAlign: 'center' }}>تحقق</Text>}
        </Pressable>
      </View>
    );
  }

  // ================= LOGIN UI =================
  return (
    <View style={{ flex: 1, backgroundColor: '#1e1b4b', justifyContent: 'center', padding: 20 }}>
      <TextInput placeholder="الاسم" value={name} onChangeText={setName} />
      <TextInput placeholder="الإيميل" value={email} onChangeText={setEmail} />
      <TextInput placeholder="رقم الهاتف" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />

      <Pressable onPress={handleLogin}>
        {loading ? <ActivityIndicator /> : <Text>تسجيل الدخول</Text>}
      </Pressable>
    </View>
  );
}
