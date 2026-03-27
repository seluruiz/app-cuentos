import AsyncStorage from '@react-native-async-storage/async-storage';
import Slider from '@react-native-community/slider';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import * as Haptics from 'expo-haptics';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  LayoutAnimation,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  UIManager,
  View,
} from 'react-native';
import Purchases from 'react-native-purchases';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const STORAGE_KEYS = {
  LIBRARY: '@stories_library',
  APP_USER_ID: '@app_user_id_v1',
  CUSTOM_VOICES: '@custom_voices_array_v1',
};

const API_BASE_URL = 'https://api.cuentosdream.com';

export default function BibliotecaScreen() {
  const voiceSoundRef = useRef(null);
  const musicSoundRef = useRef(null);

  const [library, setLibrary] = useState([]);
  const [selectedStory, setSelectedStory] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  const [creatingAudio, setCreatingAudio] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [voiceSound, setVoiceSound] = useState(null);
  const [musicSound, setMusicSound] = useState(null);
  const [positionMillis, setPositionMillis] = useState(0);
  const [durationMillis, setDurationMillis] = useState(1);
  const [velocidadVoz, setVelocidadVoz] = useState(1.0);
  const [musicEnabled, setMusicEnabled] = useState(true);
  const [appUserId, setAppUserId] = useState(null);

  const [isPremium, setIsPremium] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);
  const [packages, setPackages] = useState([]);
  const [isPurchasing, setIsPurchasing] = useState(false);

  const [customVoices, setCustomVoices] = useState([]);
  const [selectedVoiceId, setSelectedVoiceId] = useState(null);
  const [activeStoryIdPlaying, setActiveStoryIdPlaying] = useState(null);

  const loadOfferings = async () => {
    try {
      const offerings = await Purchases.getOfferings();
      if (offerings.current?.availablePackages?.length > 0) {
        setPackages(offerings.current.availablePackages);
      }
    } catch (e) {
      console.log('Error loading offerings:', e);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadData();
      return () => {
        cleanupAudio();
      };
    }, [])
  );

  useEffect(() => {
    if (selectedStory) {
      setPositionMillis(0);
      setDurationMillis(1);
      setSelectedVoiceId(null);
    }
  }, [selectedStory]);

  const loadData = async () => {
    try {
      const storedAppUserId = await AsyncStorage.getItem(STORAGE_KEYS.APP_USER_ID);
      setAppUserId(storedAppUserId);
  
      const libraryRaw = await AsyncStorage.getItem(STORAGE_KEYS.LIBRARY);
      if (libraryRaw) setLibrary(JSON.parse(libraryRaw));
  
      const savedVoices = await AsyncStorage.getItem(STORAGE_KEYS.CUSTOM_VOICES);
      if (savedVoices) setCustomVoices(JSON.parse(savedVoices));
  
      if (Platform.OS === 'android' && storedAppUserId) {
        const customerInfo = await Purchases.getCustomerInfo();
        const premium = !!customerInfo?.entitlements?.active?.premium;
        setIsPremium(premium);
        await loadOfferings();
      }
    } catch (e) {}
  };

  const cleanupAudio = async () => {
    try {
      if (voiceSoundRef.current) await voiceSoundRef.current.unloadAsync();
      if (musicSoundRef.current) await musicSoundRef.current.unloadAsync();
    } catch {}

    voiceSoundRef.current = null;
    musicSoundRef.current = null;
    setVoiceSound(null);
    setMusicSound(null);
    setIsPlaying(false);
    setActiveStoryIdPlaying(null);
    setPositionMillis(0);
    setDurationMillis(1);
  };

  const closePlayer = async () => {
    await cleanupAudio();
    setSelectedVoiceId(null);
    setSelectedStory(null);
  };

  const purchasePackage = async (pkg) => {
    try {
      setIsPurchasing(true);
      const { customerInfo } = await Purchases.purchasePackage(pkg);
      if (customerInfo?.entitlements?.active?.premium) {
        setIsPremium(true);
        setShowPaywall(false);
        Alert.alert('Félicitations ! 🎉', 'Vous êtes maintenant Premium.');
      }
    } catch (e) {
      if (!e?.userCancelled) Alert.alert('Erreur', "Impossible de finaliser l'achat.");
    } finally {
      setIsPurchasing(false);
    }
  };

  const eliminarCuento = (item) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    Alert.alert("Supprimer l'histoire ?", 'Cette magie sera perdue à jamais.', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          if (selectedStory?.id === item.id) {
            await closePlayer();
          }
          if (activeStoryIdPlaying === item.id) {
            await cleanupAudio();
          }

          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          const nuevaLibreria = library.filter((story) => story.id !== item.id);
          setLibrary(nuevaLibreria);
          await AsyncStorage.setItem(STORAGE_KEYS.LIBRARY, JSON.stringify(nuevaLibreria));
        },
      },
    ]);
  };

  const toggleFavorite = async (id) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const updatedLibrary = library.map((item) => {
      if (item.id === id) {
        const updatedItem = { ...item, isFavorite: !item.isFavorite };
        if (selectedStory?.id === id) setSelectedStory(updatedItem);
        return updatedItem;
      }
      return item;
    });
    setLibrary(updatedLibrary);
    await AsyncStorage.setItem(STORAGE_KEYS.LIBRARY, JSON.stringify(updatedLibrary));
  };

  const getVoiceNameById = (id) => {
    if (!id) return 'Fée Magique';
    return customVoices.find((v) => v.id === id)?.name || 'Fée Magique';
  };

  const skipAudio = async (millis) => {
    if (!voiceSoundRef.current) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const newPos = Math.max(0, Math.min(durationMillis, positionMillis + millis));
    await voiceSoundRef.current.setPositionAsync(newPos);
  };

  const toggleSpeed = async () => {
    const newRate = velocidadVoz === 1 ? 0.85 : 1;
    setVelocidadVoz(newRate);
    if (voiceSoundRef.current) {
      try {
        await voiceSoundRef.current.setRateAsync(newRate, true);
      } catch {}
    }
  };

  const handleToggleMusic = async (value) => {
    setMusicEnabled(value);

    if (!value && musicSoundRef.current) {
      try {
        await musicSoundRef.current.stopAsync();
        await musicSoundRef.current.setPositionAsync(0);
      } catch {}
    }

    if (value && isPlaying && !musicSoundRef.current) {
      try {
        const { sound: bg } = await Audio.Sound.createAsync(
          require('../../assets/1675_Sentimental_Wedding_Piano_60sec.wav'),
          { shouldPlay: true, isLooping: true, volume: 0.12 }
        );
        setMusicSound(bg);
        musicSoundRef.current = bg;
      } catch {}
    } else if (value && isPlaying && musicSoundRef.current) {
      try {
         await musicSoundRef.current.playAsync();
      } catch {}
    }
  };

  const handleVoiceStatusUpdate = (status) => {
    if (!status?.isLoaded) return;
    setPositionMillis(status.positionMillis || 0);
    if (status.durationMillis) setDurationMillis(status.durationMillis);
    
    if (status.didJustFinish) {
      setIsPlaying(false);
      setPositionMillis(0);
      
      if (voiceSoundRef.current) {
        voiceSoundRef.current.setPositionAsync(0).catch(() => {});
      }

      if (musicSoundRef.current) {
        musicSoundRef.current.stopAsync().catch(() => {});
        musicSoundRef.current.setPositionAsync(0).catch(() => {});
      }
    }
  };

  const playStoryAudio = async (storyArg) => {
    const targetStory = storyArg || selectedStory;
    if (!targetStory?.text) return;

    if (activeStoryIdPlaying && activeStoryIdPlaying !== targetStory.id) {
      await cleanupAudio();
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      if (voiceSoundRef.current && isPlaying && activeStoryIdPlaying === targetStory.id) {
        await voiceSoundRef.current.pauseAsync();
        if (musicSoundRef.current) await musicSoundRef.current.pauseAsync();
        setIsPlaying(false);
        return;
      }

      if (voiceSoundRef.current && !isPlaying && activeStoryIdPlaying === targetStory.id) {
        await voiceSoundRef.current.playAsync();
        if (musicEnabled && musicSoundRef.current) await musicSoundRef.current.playAsync();
        setIsPlaying(true);
        return;
      }

      await cleanupAudio();
      setCreatingAudio(true);
      setActiveStoryIdPlaying(targetStory.id);

      const voiceSuffix = selectedVoiceId ? `-${selectedVoiceId}` : '-default';
      const fileUri = `${FileSystem.documentDirectory}story-${targetStory.id}${voiceSuffix}.mp3`;
      const fileInfo = await FileSystem.getInfoAsync(fileUri);

      if (!fileInfo.exists) {
        const payload = {
          rcUserId: appUserId,
          storyId: targetStory.storyId,
          audioToken: targetStory.audioToken,
          voice: 'nova',
          speed: 0.88,
          customVoiceId: selectedVoiceId,
        };

        const response = await fetch(`${API_BASE_URL}/api/story/tts`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'x-rc-user-id': appUserId 
          },
          body: JSON.stringify(payload),
        });

        if (response.status === 403 || response.status === 429) {
          await cleanupAudio();
          Alert.alert('Oups', "Limite audio atteinte. Débloquez la magie ✨");
          setShowPaywall(true);
          return;
        }

        const data = await response.json();
        if (!response.ok) throw new Error(data?.error || 'Audio impossible');

        await FileSystem.writeAsStringAsync(fileUri, data.audioBase64, { encoding: 'base64' });
      }

      const { sound: voice } = await Audio.Sound.createAsync(
        { uri: fileUri },
        {
          shouldPlay: true,
          volume: 0.7,
          rate: velocidadVoz,
          shouldCorrectPitch: true,
          progressUpdateIntervalMillis: 500,
        },
        handleVoiceStatusUpdate
      );

      setVoiceSound(voice);
      voiceSoundRef.current = voice;
      setIsPlaying(true);

      if (musicEnabled) {
        const { sound: bg } = await Audio.Sound.createAsync(
          require('../../assets/1675_Sentimental_Wedding_Piano_60sec.wav'),
          { shouldPlay: true, isLooping: true, volume: 0.12 }
        );
        setMusicSound(bg);
        musicSoundRef.current = bg;
      }
    } catch (error) {
      Alert.alert('Erreur', error?.message || 'Impossible de lire la narration.');
      await cleanupAudio();
    } finally {
      setCreatingAudio(false);
    }
  };

  const formatMillis = (ms) => {
    const s = Math.max(0, Math.floor(ms / 1000));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };

  const filteredLibrary = useMemo(() => {
    let result = [...library];
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (i) => i.title.toLowerCase().includes(query) || i.childName.toLowerCase().includes(query)
      );
    }
    return result;
  }, [library, searchQuery]);

  const renderCard = ({ item }) => {
    const isThisPlaying = activeStoryIdPlaying === item.id && isPlaying;
    return (
      <View style={styles.cardWrapper}>
        <View style={styles.card}>
          {item.imageUrl ? (
            <Image source={{ uri: item.imageUrl }} style={styles.cardImg} />
          ) : (
            <View style={[styles.cardImg, styles.cardImgPlaceholder]}>
              <Text style={styles.cardImgPlaceholderEmoji}>📖</Text>
            </View>
          )}
          <View style={styles.imgOverlay} />

          <View style={styles.topActionsOverlay}>
            <TouchableOpacity onPress={() => toggleFavorite(item.id)} style={styles.actionIconPill}>
              <Text style={styles.actionIcon}>{item.isFavorite ? '❤️' : '🤍'}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => eliminarCuento(item)} style={styles.actionIconPill}>
              <Text style={styles.actionIcon}>🗑️</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.cardContent}>
            <TouchableOpacity 
              style={{ flex: 1 }} 
              onPress={() => setSelectedStory(item)} 
              activeOpacity={0.8}
            >
              <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
              <Text style={styles.cardMeta}>{item.childName} · {item.dateLabel}</Text>
              <Text style={styles.cardNarrator}>Narrateur : {item.narratorName || 'Fée Magique'}</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.playBtnIntegrated, isThisPlaying && styles.playBtnIntegratedActive]} 
              onPress={() => playStoryAudio(item)}
            >
              <Text style={styles.playIconSmall}>{isThisPlaying ? '⏸' : '▶️'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.headerTitle}>Bibliothèque 📚</Text>

      <View style={styles.searchContainer}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Rechercher Lucas, dinosaures..."
          placeholderTextColor="#64748B"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      <FlatList
        data={filteredLibrary}
        keyExtractor={(i, index) => i?.id?.toString?.() || String(index)}
        contentContainerStyle={{ padding: 20, paddingBottom: 150 }}
        renderItem={renderCard}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>🌙</Text>
            <Text style={styles.emptyTitle}>Aucun conte magique trouvé.</Text>
            <Text style={styles.emptySub}>Créez votre première histoire magique sur l'écran d'accueil ✨</Text>
          </View>
        }
      />

      <Modal visible={selectedStory !== null} animationType="slide" onRequestClose={closePlayer}>
        <View style={styles.modalContainer}>
          <TouchableOpacity onPress={closePlayer} style={styles.closeBtnCircle}>
            <Text style={styles.closeBtnText}>✕</Text>
          </TouchableOpacity>

          <ScrollView contentContainerStyle={styles.modalScroll}>
            {selectedStory?.imageUrl ? (
              <Image source={{ uri: selectedStory.imageUrl }} style={styles.modalImage} />
            ) : (
              <View style={[styles.modalImage, styles.cardImgPlaceholder]}>
                <Text style={styles.cardImgPlaceholderEmoji}>📖</Text>
              </View>
            )}
            
            <Text style={styles.modalTitle}>{selectedStory?.title}</Text>
            <Text style={styles.modalMeta}>{selectedStory?.childName} · {selectedStory?.childAge} ans · {selectedStory?.dateLabel}</Text>

            <View style={styles.voiceSelectorInside}>
              <Text style={styles.voiceLabel}>QUI DOIT RACONTER ?</Text>
              <View style={styles.voiceStack}>
                <TouchableOpacity
                  style={[styles.vPill, selectedVoiceId === null && styles.vPillActive]}
                  onPress={async () => {
                    await cleanupAudio();
                    setSelectedVoiceId(null);
                  }}
                >
                  <Text style={[styles.vText, selectedVoiceId === null && styles.vTextActive]}>🧚‍♀️ Fée Magique</Text>
                </TouchableOpacity>

                {customVoices.map((v) => (
                  <TouchableOpacity
                    key={v.id}
                    style={[styles.vPill, selectedVoiceId === v.id && styles.vPillActive]}
                    onPress={async () => {
                      await cleanupAudio();
                      setSelectedVoiceId(v.id);
                    }}
                  >
                    <Text style={[styles.vText, selectedVoiceId === v.id && styles.vTextActive]}>🎙️ {v.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.voiceHelperText}>
                Lecture avec : {getVoiceNameById(selectedVoiceId)}
              </Text>
            </View>

            <View style={styles.musicRow}>
              <Text style={styles.musicLabel}>Musique de piano relaxante</Text>
              <Switch
                value={musicEnabled}
                onValueChange={handleToggleMusic}
                trackColor={{ false: '#334155', true: '#10B981' }}
              />
            </View>

            <View style={styles.playerControls}>
              <TouchableOpacity onPress={() => skipAudio(-10000)} style={styles.skipBtn}>
                <Text style={styles.skipText}>-10s</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.mainPlayBtn} onPress={() => playStoryAudio(selectedStory)} disabled={creatingAudio}>
                {creatingAudio ? <ActivityIndicator color="#FFF" /> : <Text style={styles.mainPlayText}>{isPlaying ? '⏸' : '▶️'}</Text>}
              </TouchableOpacity>

              <TouchableOpacity onPress={() => skipAudio(10000)} style={styles.skipBtn}>
                <Text style={styles.skipText}>+10s</Text>
              </TouchableOpacity>
            </View>

            <Slider
              style={{ width: '100%', height: 40, marginTop: 10 }}
              minimumValue={0}
              maximumValue={durationMillis}
              value={positionMillis}
              minimumTrackTintColor="#FCD34D"
              maximumTrackTintColor="#334155"
              thumbTintColor="#FCD34D"
              onSlidingComplete={(v) => voiceSoundRef.current?.setPositionAsync(v)}
            />
            <Text style={styles.progressLabel}>{formatMillis(positionMillis)} / {formatMillis(durationMillis)}</Text>

            <TouchableOpacity
              style={styles.speedBtn}
              onPress={toggleSpeed}
            >
              <Text style={styles.speedBtnText}>
                Vitesse : {velocidadVoz === 1 ? 'Normale (1x)' : 'Relaxante (0.85x)'}
              </Text>
            </TouchableOpacity>

            <Text style={styles.modalText}>{selectedStory?.text}</Text>
          </ScrollView>
        </View>
      </Modal>

      <Modal visible={showPaywall} animationType="slide" transparent>
        <View style={styles.pwOverlay}>
          <View style={styles.pwContent}>
            <TouchableOpacity style={styles.pwClose} onPress={() => setShowPaywall(false)}>
              <Text style={{ color: '#FFF', fontSize: 18, fontWeight: 'bold' }}>✕</Text>
            </TouchableOpacity>

            <Text style={{ fontSize: 55, marginBottom: 10 }}>✨</Text>
            <Text style={styles.pwTitle}>Passez au Premium</Text>
            <Text style={styles.pwSub}>
              Débloquez la magie illimitée !{'\n'}• Histoires à l'infini{'\n'}• Clonez votre propre voix{'\n'}• Accès à toutes les voix magiques
            </Text>

            {packages.length > 0 ? (
              packages.map((pkg) => (
                <TouchableOpacity
                  key={pkg.identifier}
                  style={styles.pwBtnPremium}
                  onPress={() => purchasePackage(pkg)}
                  disabled={isPurchasing}
                >
                  {isPurchasing ? (
                    <ActivityIndicator color="#FFF" />
                  ) : (
                    <>
                      <Text style={styles.pwBtnPremiumTitle}>
                        {pkg.packageType === 'MONTHLY' ? '🎁 Essai gratuit' : '🚀 Plan Annuel'}
                      </Text>
                      <Text style={styles.pwBtnPremiumPrice}>Puis {pkg.product.priceString}</Text>
                    </>
                  )}
                </TouchableOpacity>
              ))
            ) : (
              <View style={{ marginTop: 20, alignItems: 'center' }}>
                <ActivityIndicator color="#FCD34D" size="large" />
                <Text style={{ color: '#94A3B8', marginTop: 15, textAlign: 'center' }}>Recherche des meilleures offres...</Text>
                <TouchableOpacity style={{ marginTop: 20, paddingHorizontal: 20, paddingVertical: 12, backgroundColor: '#334155', borderRadius: 12 }} onPress={loadOfferings}>
                  <Text style={{ color: '#FFF', fontWeight: 'bold' }}>Réessayer</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F172A', paddingTop: 60 },
  headerTitle: { fontSize: 34, fontWeight: '900', color: '#FCD34D', textAlign: 'center', marginBottom: 25 },
  searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1E293B', marginHorizontal: 20, borderRadius: 16, paddingHorizontal: 15, marginBottom: 25, borderWidth: 1, borderColor: '#334155' },
  searchIcon: { fontSize: 16, marginRight: 10 },
  searchInput: { flex: 1, color: '#FFF', paddingVertical: 15, fontSize: 16 },
  cardWrapper: { marginBottom: 25 },
  card: { backgroundColor: '#1E293B', borderRadius: 24, overflow: 'hidden', borderWidth: 1, borderColor: '#334155', shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.4, shadowRadius: 12, elevation: 10 },
  cardImg: { width: '100%', height: 200 },
  cardImgPlaceholder: { justifyContent: 'center', alignItems: 'center', backgroundColor: '#334155' },
  cardImgPlaceholderEmoji: { fontSize: 42 },
  imgOverlay: { position: 'absolute', top: 150, left: 0, right: 0, height: 50, backgroundColor: 'rgba(30, 41, 59, 0.6)' },
  topActionsOverlay: { position: 'absolute', top: 15, right: 15, flexDirection: 'row', gap: 10, zIndex: 10 },
  actionIconPill: { backgroundColor: 'rgba(15, 23, 42, 0.7)', width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#334155' },
  actionIcon: { fontSize: 18 },
  cardContent: { padding: 20, flexDirection: 'row', alignItems: 'center' },
  cardTitle: { color: '#FFF', fontSize: 18, fontWeight: '800', marginBottom: 4 },
  cardMeta: { color: '#94A3B8', fontSize: 13, marginBottom: 4 },
  cardNarrator: { color: '#FCD34D', fontSize: 11, fontWeight: '700' },
  playBtnIntegrated: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#334155', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#475569', marginLeft: 10 },
  playBtnIntegratedActive: { backgroundColor: '#10B981', borderColor: '#34D399' },
  playIconSmall: { fontSize: 16 },
  emptyState: { alignItems: 'center', marginTop: 80, paddingHorizontal: 40 },
  emptyEmoji: { fontSize: 60, marginBottom: 20 },
  emptyTitle: { color: '#FFF', fontSize: 20, fontWeight: '800', marginBottom: 10 },
  emptySub: { color: '#94A3B8', textAlign: 'center', fontSize: 14, lineHeight: 22 },
  modalContainer: { flex: 1, backgroundColor: '#0F172A' },
  modalScroll: { padding: 24, paddingBottom: 100 },
  closeBtnCircle: { position: 'absolute', top: 50, right: 20, zIndex: 10, backgroundColor: '#334155', width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  closeBtnText: { color: '#FFF', fontWeight: 'bold' },
  modalImage: { width: '100%', height: 280, borderRadius: 24, marginBottom: 20 },
  modalTitle: { color: '#FFF', fontSize: 26, fontWeight: '900', textAlign: 'center', marginBottom: 5 },
  modalMeta: { color: '#64748B', fontSize: 13, textAlign: 'center', marginBottom: 20 },
  voiceSelectorInside: { backgroundColor: '#1E293B', padding: 15, borderRadius: 18, marginBottom: 25, borderWidth: 1, borderColor: '#334155' },
  voiceLabel: { color: '#64748B', fontSize: 10, fontWeight: '800', textAlign: 'center', marginBottom: 12 },
  voiceStack: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 },
  vPill: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 12, backgroundColor: '#0F172A', borderWidth: 1, borderColor: '#334155' },
  vPillActive: { backgroundColor: '#FCD34D', borderColor: '#F59E0B' },
  vText: { color: '#94A3B8', fontSize: 12, fontWeight: '700' },
  vTextActive: { color: '#0F172A' },
  voiceHelperText: { color: '#94A3B8', textAlign: 'center', fontSize: 12, marginTop: 8 },
  musicRow: { marginBottom: 18, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#1E293B', padding: 14, borderRadius: 14, borderWidth: 1, borderColor: '#334155' },
  musicLabel: { color: '#FFF', fontWeight: '700', flex: 1, paddingRight: 10 },
  playerControls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 20, marginBottom: 10 },
  mainPlayBtn: { width: 70, height: 70, borderRadius: 35, backgroundColor: '#10B981', alignItems: 'center', justifyContent: 'center' },
  mainPlayText: { fontSize: 30 },
  skipBtn: { paddingVertical: 10, paddingHorizontal: 15, backgroundColor: '#334155', borderRadius: 12 },
  skipText: { color: '#FFF', fontSize: 12, fontWeight: '800' },
  progressLabel: { color: '#64748B', textAlign: 'center', fontSize: 12, marginBottom: 20, marginTop: 5 },
  speedBtn: { alignSelf: 'center', paddingVertical: 8, paddingHorizontal: 14, backgroundColor: '#334155', borderRadius: 12, marginTop: 8, marginBottom: 25 },
  speedBtnText: { color: '#FFF', fontSize: 12, fontWeight: '700' },
  modalText: { color: '#F8FAFC', fontSize: 17, lineHeight: 28 },

  /* ESTILOS DEL NUEVO PAYWALL */
  pwOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.95)', justifyContent: 'center', padding: 20 },
  pwContent: { backgroundColor: '#1E293B', borderRadius: 32, padding: 30, alignItems: 'center', borderWidth: 1, borderColor: '#8B5CF6', shadowColor: '#8B5CF6', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.3, shadowRadius: 20, elevation: 10 },
  pwClose: { position: 'absolute', top: 20, right: 20, width: 32, height: 32, backgroundColor: '#334155', borderRadius: 16, alignItems: 'center', justifyContent: 'center', zIndex: 10 },
  pwTitle: { color: '#FFF', fontSize: 26, fontWeight: '900', textAlign: 'center' },
  pwSub: { color: '#CBD5E1', textAlign: 'center', marginVertical: 20, lineHeight: 24, fontSize: 15 },
  pwBtnPremium: { backgroundColor: '#8B5CF6', width: '100%', padding: 20, borderRadius: 20, alignItems: 'center', marginBottom: 12, shadowColor: '#8B5CF6', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8, elevation: 5 },
  pwBtnPremiumTitle: { color: '#FFF', fontWeight: '900', fontSize: 18 },
  pwBtnPremiumPrice: { color: '#E2E8F0', marginTop: 4, fontSize: 14, fontWeight: '600' },
});