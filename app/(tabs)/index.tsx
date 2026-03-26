import AsyncStorage from '@react-native-async-storage/async-storage';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import * as Haptics from 'expo-haptics';
import { router, useFocusEffect } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Keyboard,
  KeyboardAvoidingView,
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
  LAST_SETTINGS: '@last_app_settings_v1',
};

const API_BASE_URL = 'https://api.cuentosdream.com';
const REVENUECAT_API_KEY = 'goog_AFLbHJIDUEYUXKCHzsdoWuabRCK';

const SUGGESTIONS = [
  "Dinosaurs à la plage 🦖",
  "Princesse courageuse 👑",
  "Spiderman dans les étoiles 🕷️",
  "Pat' Patrouille en mission 🐾",
  'Voyage sur la Lune 🌙',
];

const STORY_LOADING_MESSAGES = [
  'Préparation de la magie ✨...',
  "Recherche d'une douce aventure 🌙...",
  "Écriture du conte secret ✍️...",
  'Création des illustrations 🖼️...',
];

const AUDIO_LOADING_MESSAGES = [
  "Préparation de l'audio HD 🎧...",
  'Connexion au studio magique 🎙️...',
  "Ajustement de l'intonation ✨...",
];

export default function HomeScreen() {
  const scrollRef = useRef(null);
  
  // Refs para mantener la referencia viva en los callbacks
  const voiceSoundRef = useRef(null);
  const musicSoundRef = useRef(null);

  const [nombre, setNombre] = useState('');
  const [edad, setEdad] = useState('');
  const [tema, setTema] = useState('');
  const [historia, setHistoria] = useState('');

  const [loadingApp, setLoadingApp] = useState(true);
  const [creatingStory, setCreatingStory] = useState(false);
  const [creatingAudio, setCreatingAudio] = useState(false);

  const [library, setLibrary] = useState([]);
  const [currentStory, setCurrentStory] = useState(null);

  const [musicEnabled, setMusicEnabled] = useState(true);
  const [velocidadVoz, setVelocidadVoz] = useState(1.0);

  const [voiceSound, setVoiceSound] = useState(null);
  const [musicSound, setMusicSound] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [positionMillis, setPositionMillis] = useState(0);
  const [durationMillis, setDurationMillis] = useState(1);

  const [isPremium, setIsPremium] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);
  const [packages, setPackages] = useState([]);
  const [isPurchasing, setIsPurchasing] = useState(false);

  const [appUserId, setAppUserId] = useState(null);
  const [loadingMessage, setLoadingMessage] = useState(STORY_LOADING_MESSAGES[0]);
  const [audioLoadingMessage, setAudioLoadingMessage] = useState(AUDIO_LOADING_MESSAGES[0]);

  const [selectedVoiceId, setSelectedVoiceId] = useState(null);
  const [customVoices, setCustomVoices] = useState([]);

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
      if (!e?.userCancelled) {
        Alert.alert('Erreur', "Impossible de finaliser l'achat.");
      }
    } finally {
      setIsPurchasing(false);
    }
  };
  
  const restorePurchases = async () => {
    try {
      setIsPurchasing(true);
      const customerInfo = await Purchases.restorePurchases();
  
      if (customerInfo?.entitlements?.active?.premium) {
        setIsPremium(true);
        setShowPaywall(false);
        Alert.alert('Succès', 'Vos achats ont été restaurés.');
      } else {
        Alert.alert('Oups', 'Aucun achat Premium trouvé sur ce compte.');
      }
    } catch (e) {
      Alert.alert('Erreur', 'Impossible de restaurer les achats.');
    } finally {
      setIsPurchasing(false);
    }
  };

  useEffect(() => {
    let interval;
    if (creatingStory) {
      let i = 0;
      setLoadingMessage(STORY_LOADING_MESSAGES[0]);
      interval = setInterval(() => {
        i = (i + 1) % STORY_LOADING_MESSAGES.length;
        setLoadingMessage(STORY_LOADING_MESSAGES[i]);
      }, 2500);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [creatingStory]);

  useEffect(() => {
    let interval;
    if (creatingAudio) {
      let i = 0;
      setAudioLoadingMessage(AUDIO_LOADING_MESSAGES[0]);
      interval = setInterval(() => {
        i = (i + 1) % AUDIO_LOADING_MESSAGES.length;
        setAudioLoadingMessage(AUDIO_LOADING_MESSAGES[i]);
      }, 2200);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [creatingAudio]);

  useFocusEffect(
    React.useCallback(() => {
      const init = async () => {
        await configureAudio();
        await loadLocalData();
        await loadOrCreateAppUserId();
        await initRevenueCat();
        setLoadingApp(false);
      };

      init();

      return () => {
        cleanupAllAudio();
      };
    }, [])
  );

  const saveCurrentSettings = async (overrideVoiceId) => {
    try {
      const settings = {
        nombre,
        edad,
        tema,
        selectedVoiceId: overrideVoiceId !== undefined ? overrideVoiceId : selectedVoiceId,
      };
      await AsyncStorage.setItem(STORAGE_KEYS.LAST_SETTINGS, JSON.stringify(settings));
    } catch (error) {
      console.log('Error saving settings:', error?.message);
    }
  };

  const loadOrCreateAppUserId = async () => {
    let id = await AsyncStorage.getItem(STORAGE_KEYS.APP_USER_ID);
    if (!id) {
      id = `cd_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 14)}`;
      await AsyncStorage.setItem(STORAGE_KEYS.APP_USER_ID, id);
    }
    setAppUserId(id);
    return id;
  };

  const initRevenueCat = async () => {
    try {
      if (Platform.OS === 'android') {
        const customerInfo = await Purchases.getCustomerInfo();
        setIsPremium(!!customerInfo?.entitlements?.active?.premium);

        const offerings = await Purchases.getOfferings();
        if (offerings.current) {
          setPackages(offerings.current.availablePackages);
        }
      }
    } catch (e) {
      console.log('Error leyendo Purchases en Home:', e.message);
    }
  };

  const loadLocalData = async () => {
    try {
      const libraryRaw = await AsyncStorage.getItem(STORAGE_KEYS.LIBRARY);
      if (libraryRaw) setLibrary(JSON.parse(libraryRaw));

      const savedVoices = await AsyncStorage.getItem(STORAGE_KEYS.CUSTOM_VOICES);
      if (savedVoices) setCustomVoices(JSON.parse(savedVoices));

      const lastSettings = await AsyncStorage.getItem(STORAGE_KEYS.LAST_SETTINGS);
      if (lastSettings) {
        const { nombre: n, edad: e, tema: t, selectedVoiceId: v } = JSON.parse(lastSettings);
        setNombre(n || '');
        setEdad(e || '');
        setTema(t || '');
        setSelectedVoiceId(v || null);
      }
    } catch (error) {
      console.log('Error loading local data:', error?.message);
    }
  };

  const persistLibrary = async (updatedLibrary) => {
    setLibrary(updatedLibrary);
    await AsyncStorage.setItem(STORAGE_KEYS.LIBRARY, JSON.stringify(updatedLibrary));
  };

  const cleanupAllAudio = async () => {
    try {
      if (voiceSoundRef.current) await voiceSoundRef.current.unloadAsync();
      if (musicSoundRef.current) await musicSoundRef.current.unloadAsync();
    } catch (error) {
      console.log('Error cleaning audio:', error?.message);
    } finally {
      voiceSoundRef.current = null;
      musicSoundRef.current = null;
      setVoiceSound(null);
      setMusicSound(null);
      setIsPlaying(false);
      setPositionMillis(0);
      setDurationMillis(1);
    }
  };

  const configureAudio = async () => {
    try {
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
      });
    } catch (error) {
      console.log('Error configuring audio:', error?.message);
    }
  };

  const getVoiceNameById = (id) => {
    if (!id) return 'Fée Magique';
    return customVoices.find((v) => v.id === id)?.name || 'Fée Magique';
  };

  const validateStoryForm = () => {
    if (!nombre.trim() || !edad.trim() || !tema.trim()) {
      Alert.alert('Oups !', "Veuillez remplir le prénom, l'âge et le thème.");
      return false;
    }

    if (historia.trim().length < 5) {
      Alert.alert(
        'Ajoute juste un peu plus de détails ✨',
        "Décrivez l'histoire en quelques mots pour lancer la magie."
      );
      return false;
    }

    return true;
  };

  const createStory = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    if (!validateStoryForm()) return;

    Keyboard.dismiss();
    setCreatingStory(true);
    await saveCurrentSettings();

    try {
      await cleanupAllAudio();

      const response = await fetch(`${API_BASE_URL}/api/story/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          childName: nombre.trim(),
          childAge: edad.trim(),
          theme: tema.trim(),
          storyline: historia.trim(),
          language: 'fr',
          rcUserId: appUserId,
        }),
      });

      if (response.status === 429 || response.status === 403) {
        Alert.alert('Oups', "Vous avez atteint la limite. Débloquez la magie illimitée ✨");
        setShowPaywall(true);
        return;
      }

      if (!response.ok) {
        throw new Error('Erreur serveur');
      }

      const data = await response.json();

      let localImageUrl = null;
      if (data.imageUrl) {
        try {
          const fileUri = `${FileSystem.documentDirectory}img-${Date.now()}.jpg`;
          const { uri } = await FileSystem.downloadAsync(data.imageUrl, fileUri);
          localImageUrl = uri;
        } catch (imageError) {
          localImageUrl = data.imageUrl || null;
        }
      }

      const story = {
        id: Date.now().toString(),
        storyId: data.storyId,
        audioToken: data.audioToken,
        title: data?.title || 'Conte Magique',
        text: data?.storyText || '',
        imageUrl: localImageUrl,
        audioUrl: null,
        childName: nombre.trim(),
        childAge: edad.trim(),
        theme: tema.trim(),
        isFavorite: false,
        dateLabel: new Date().toLocaleDateString('fr-FR'),
        narratorName: getVoiceNameById(selectedVoiceId),
      };

      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setCurrentStory(story);

      const updatedLibrary = [story, ...library];
      await persistLibrary(updatedLibrary);

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      setTimeout(() => {
        scrollRef.current?.scrollToEnd({ animated: true });
      }, 400);
    } catch (error) {
      Alert.alert('Erreur', "Impossible de créer l'histoire.");
    } finally {
      setCreatingStory(false);
    }
  };

  const togglePlayback = async () => {
    if (!voiceSoundRef.current) return;

    if (isPlaying) {
      await voiceSoundRef.current.pauseAsync();
      if (musicSoundRef.current) await musicSoundRef.current.pauseAsync();
      setIsPlaying(false);
    } else {
      await voiceSoundRef.current.playAsync();
      if (musicSoundRef.current && musicEnabled) await musicSoundRef.current.playAsync();
      setIsPlaying(true);
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
          {
            shouldPlay: true,
            isLooping: true,
            volume: 0.12,
          }
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

  const playStoryAudio = async () => {
    if (!currentStory?.text) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      if (voiceSoundRef.current) {
        await togglePlayback();
        return;
      }

      setCreatingAudio(true);

      const voiceSuffix = selectedVoiceId ? `-${selectedVoiceId}` : '-default';
      const fileUri = `${FileSystem.documentDirectory}story-${currentStory.id}${voiceSuffix}.mp3`;

      const fileInfo = await FileSystem.getInfoAsync(fileUri);

      if (!fileInfo.exists) {
        const payload = {
          rcUserId: appUserId,
          storyId: currentStory.storyId,
          audioToken: currentStory.audioToken,
          voice: 'nova',
          speed: 0.88,
          customVoiceId: selectedVoiceId,
        };

        const response = await fetch(`${API_BASE_URL}/api/story/tts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (response.status === 429 || response.status === 403) {
          Alert.alert('Oups', "Limite audio atteinte. Débloquez la magie ✨");
          setShowPaywall(true);
          return;
        }

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data?.error || 'TTS error');
        }

        await FileSystem.writeAsStringAsync(fileUri, data.audioBase64, {
          encoding: 'base64',
        });
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
        (status) => {
          if (status.isLoaded) {
            setPositionMillis(status.positionMillis || 0);
            setDurationMillis(status.durationMillis || 1);

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
          }
        }
      );

      setVoiceSound(voice);
      voiceSoundRef.current = voice;
      setIsPlaying(true);

      if (musicEnabled) {
        const { sound: bg } = await Audio.Sound.createAsync(
          require('../../assets/1675_Sentimental_Wedding_Piano_60sec.wav'),
          {
            shouldPlay: true,
            isLooping: true,
            volume: 0.12,
          }
        );
        setMusicSound(bg);
        musicSoundRef.current = bg;
      }
    } catch (error) {
      Alert.alert('Erreur', error.message || 'Narration impossible.');
    } finally {
      setCreatingAudio(false);
    }
  };

  const resetForNewStory = async () => {
    await cleanupAllAudio();
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setCurrentStory(null);
    setHistoria('');
    setTimeout(() => {
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    }, 150);
  };

  if (loadingApp) {
    return (
      <View style={styles.loaderScreen}>
        <ActivityIndicator size="large" color="#FCD34D" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroContainer}>
          <Text style={styles.heroTitle}>Votre voix.</Text>
          <Text style={styles.heroTitle}>Son histoire.</Text>
          <Text style={[styles.heroTitle, { color: '#FCD34D' }]}>
            Son sommeil. 🌙
          </Text>
          <Text style={styles.heroSubtext}>
            Créez une histoire unique en 1 minute, avec une voix magique ou la vôtre.
          </Text>
        </View>

        <View style={styles.voiceSelectorContainer}>
          <Text style={styles.voiceSelectorLabel}>QUI VA RACONTER L'HISTOIRE ?</Text>

          <View style={styles.voiceOptionsWrapper}>
            <TouchableOpacity
              style={[styles.voicePill, selectedVoiceId === null && styles.voicePillActive]}
              onPress={async () => {
                if (voiceSoundRef.current) {
                  await cleanupAllAudio();
                }
                setSelectedVoiceId(null);
                saveCurrentSettings(null);
              }}
            >
              <Text
                style={[
                  styles.voicePillText,
                  selectedVoiceId === null && styles.voicePillTextActive,
                ]}
              >
                🧚‍♀️ Fée Magique
              </Text>
            </TouchableOpacity>

            {customVoices.map((v) => (
              <TouchableOpacity
                key={v.id}
                style={[styles.voicePill, selectedVoiceId === v.id && styles.voicePillActive]}
                onPress={async () => {
                  if (voiceSoundRef.current) {
                    await cleanupAllAudio();
                  }
                  setSelectedVoiceId(v.id);
                  saveCurrentSettings(v.id);
                }}
              >
                <Text
                  style={[
                    styles.voicePillText,
                    selectedVoiceId === v.id && styles.voicePillTextActive,
                  ]}
                >
                  🎙️ {v.name}
                </Text>
              </TouchableOpacity>
            ))}

            <TouchableOpacity
              style={styles.voicePillAdd}
              onPress={() => router.push('/voces')}
            >
              <Text style={styles.voicePillAddText}>+ Cloner une nouvelle voix</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>PRÉNOM DE L'ENFANT</Text>
          <View style={styles.inputContainer}>
            <Text style={styles.inputIcon}>👦</Text>
            <TextInput
              style={styles.input}
              placeholder="Ex. Lucas"
              placeholderTextColor="#64748B"
              value={nombre}
              onChangeText={setNombre}
            />
          </View>

          <Text style={styles.label}>SON ÂGE</Text>
          <View style={styles.inputContainer}>
            <Text style={styles.inputIcon}>🎂</Text>
            <TextInput
              style={styles.input}
              placeholder="Ex. 4"
              placeholderTextColor="#64748B"
              keyboardType="numeric"
              value={edad}
              onChangeText={setEdad}
            />
          </View>

          <Text style={styles.label}>UNIVERS OU THÈME</Text>
          <View style={styles.inputContainer}>
            <Text style={styles.inputIcon}>🚀</Text>
            <TextInput
              style={styles.input}
              placeholder="Ex. dinosaures, étoiles..."
              placeholderTextColor="#64748B"
              value={tema}
              onChangeText={setTema}
            />
          </View>

          <Text style={styles.label}>IDÉES RAPIDES</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.suggestionsRow}
            style={{ marginBottom: 15 }}
          >
            {SUGGESTIONS.map((s, idx) => (
              <TouchableOpacity
                key={idx}
                style={styles.suggestionChip}
                onPress={() => setHistoria(s)}
              >
                <Text style={styles.suggestionChipText}>{s}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <Text style={styles.label}>VOTRE IDÉE D'HISTOIRE</Text>
          <View style={[styles.inputContainer, styles.storyInputContainer]}>
            <Text style={styles.inputIcon}>✍️</Text>
            <TextInput
              style={[styles.input, styles.storyInput]}
              placeholder="Décrivez l'histoire..."
              placeholderTextColor="#64748B"
              multiline
              value={historia}
              onChangeText={setHistoria}
              textAlignVertical="top"
              maxLength={600}
            />
          </View>

          <Text style={styles.storyHint}>
            Ajoutez ses héros préférés, une émotion douce ou une petite aventure.
          </Text>

          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>Musique de piano relaxante</Text>
            <Switch
              value={musicEnabled}
              onValueChange={handleToggleMusic}
              trackColor={{ false: '#334155', true: '#10B981' }}
            />
          </View>

          <Text style={styles.discoveryText}>
            {isPremium
              ? 'Accès Premium actif ✨'
              : "Offre découverte : 1 histoire gratuite aujourd'hui"}
          </Text>

          <Text style={styles.voiceSelectionIndicator}>
            Cette histoire sera racontée par :{' '}
            <Text style={styles.voiceSelectionIndicatorStrong}>
              {getVoiceNameById(selectedVoiceId)}
            </Text>
          </Text>

          <TouchableOpacity
            style={styles.primaryButton}
            onPress={createStory}
            disabled={creatingStory}
            activeOpacity={0.9}
          >
            {creatingStory ? (
              <View style={styles.inlineLoader}>
                <ActivityIndicator color="#FFF" />
                <Text style={styles.primaryButtonTextLoading}>{loadingMessage}</Text>
              </View>
            ) : (
              <Text style={styles.primaryButtonText}>Créer son histoire du soir 🌙</Text>
            )}
          </TouchableOpacity>
        </View>

        {currentStory && (
          <View style={styles.storyResultCard}>
            {!!currentStory.imageUrl && (
              <Image source={{ uri: currentStory.imageUrl }} style={styles.storyCoverImage} />
            )}

            <Text style={styles.storyTitle}>{currentStory.title}</Text>
            <Text style={styles.storyMeta}>
              {currentStory.childName} · {currentStory.childAge} ans · {currentStory.dateLabel}
            </Text>

            <Text style={styles.narratorBadge}>
              🎙️ Narré par : {currentStory.narratorName}
            </Text>

            <TouchableOpacity
              style={styles.audioButton}
              onPress={playStoryAudio}
              disabled={creatingAudio}
              activeOpacity={0.9}
            >
              {creatingAudio ? (
                <View style={styles.inlineLoader}>
                  <ActivityIndicator color="#FFF" />
                  <Text style={styles.audioButtonTextLoading}>{audioLoadingMessage}</Text>
                </View>
              ) : (
                <Text style={styles.audioButtonText}>
                  {isPlaying ? '⏸ Pause' : '▶️ Écouter le conte'}
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => router.push('/biblioteca')}
              activeOpacity={0.9}
            >
              <Text style={styles.secondaryButtonText}>Voir dans la bibliothèque 📚</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.tertiaryButton}
              onPress={resetForNewStory}
              activeOpacity={0.9}
            >
              <Text style={styles.tertiaryButtonText}>Créer une nouvelle histoire ✨</Text>
            </TouchableOpacity>

            <Text style={styles.storyText}>{currentStory.text}</Text>
          </View>
        )}
      </ScrollView>

      <Modal visible={showPaywall} animationType="slide" transparent>
        <View style={styles.pwOverlay}>
          <View style={styles.pwContent}>
            <TouchableOpacity style={styles.pwClose} onPress={() => setShowPaywall(false)}>
              <Text style={{ color: '#FFF', fontSize: 18, fontWeight: 'bold' }}>✕</Text>
            </TouchableOpacity>

            <Text style={{ fontSize: 50 }}>💖</Text>
            <Text style={styles.pwTitle}>Libérez la magie</Text>
            <Text style={styles.pwSub}>
              Créez des histoires illimitées avec votre propre voix.
            </Text>

            {packages.length > 0 ? (
              packages.map((pkg) => (
                <TouchableOpacity
                  key={pkg.identifier}
                  style={styles.pwBtn}
                  onPress={() => purchasePackage(pkg)}
                  disabled={isPurchasing}
                >
                  {isPurchasing ? (
                    <ActivityIndicator color="#0F172A" />
                  ) : (
                    <>
                      <Text style={{ color: '#0F172A', fontWeight: '900' }}>
                        {pkg.packageType === 'MONTH' ? '🎁 Essai gratuit' : 'Plan Annuel'}
                      </Text>
                      <Text style={{ color: '#78350F' }}>{pkg.product.priceString}</Text>
                    </>
                  )}
                </TouchableOpacity>
              ))
            ) : (
              <View style={{ marginTop: 10, alignItems: 'center' }}>
                <ActivityIndicator color="#FCD34D" />
                <Text style={{ color: '#94A3B8', marginTop: 10 }}>Chargement des offres...</Text>
              </View>
            )}

            <TouchableOpacity onPress={restorePurchases} style={{ marginTop: 12 }}>
              <Text style={{ color: '#94A3B8', textDecorationLine: 'underline' }}>
                Restaurer mes achats
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  loaderScreen: {
    flex: 1,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    padding: 24,
    paddingTop: 60,
    paddingBottom: 140,
  },
  heroContainer: {
    alignItems: 'center',
    marginBottom: 25,
  },
  heroTitle: {
    fontSize: 36,
    fontWeight: '900',
    color: '#FFF',
    textAlign: 'center',
    lineHeight: 42,
  },
  heroSubtext: {
    marginTop: 14,
    color: '#94A3B8',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    paddingHorizontal: 12,
  },
  voiceSelectorContainer: {
    marginBottom: 25,
  },
  voiceSelectorLabel: {
    color: '#64748B',
    fontSize: 10,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 15,
    letterSpacing: 0.8,
  },
  voiceOptionsWrapper: {
    gap: 10,
  },
  voicePill: {
    backgroundColor: '#1E293B',
    padding: 15,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#334155',
    alignItems: 'center',
  },
  voicePillActive: {
    backgroundColor: '#FCD34D',
    borderColor: '#F59E0B',
  },
  voicePillText: {
    color: '#94A3B8',
    fontWeight: '700',
    fontSize: 15,
  },
  voicePillTextActive: {
    color: '#0F172A',
    fontWeight: '900',
  },
  voicePillAdd: {
    padding: 15,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#8B5CF6',
    alignItems: 'center',
    backgroundColor: 'rgba(139, 92, 246, 0.08)',
  },
  voicePillAddText: {
    color: '#C4B5FD',
    fontWeight: '800',
    fontSize: 15,
  },
  card: {
    backgroundColor: '#1E293B',
    borderRadius: 24,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#334155',
  },
  label: {
    color: '#94A3B8',
    fontSize: 10,
    fontWeight: '800',
    marginBottom: 8,
    marginLeft: 4,
    letterSpacing: 0.8,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    borderRadius: 16,
    paddingHorizontal: 14,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  storyInputContainer: {
    height: 120,
    alignItems: 'flex-start',
    paddingTop: 12,
  },
  inputIcon: {
    fontSize: 18,
    marginRight: 8,
    marginTop: 0,
  },
  input: {
    flex: 1,
    color: '#FFF',
    paddingVertical: 15,
    fontSize: 16,
  },
  storyInput: {
    paddingTop: 0,
    paddingBottom: 12,
  },
  suggestionsRow: {
    paddingRight: 8,
  },
  suggestionChip: {
    backgroundColor: '#334155',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    marginRight: 8,
  },
  suggestionChipText: {
    color: '#E2E8F0',
    fontSize: 12,
    fontWeight: '600',
  },
  storyHint: {
    color: '#64748B',
    fontSize: 12,
    lineHeight: 18,
    marginTop: -6,
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  switchRow: {
    marginBottom: 15,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  switchLabel: {
    color: '#FFF',
    fontWeight: '700',
    flex: 1,
    paddingRight: 12,
  },
  discoveryText: {
    color: '#FCD34D',
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 12,
  },
  voiceSelectionIndicator: {
    color: '#94A3B8',
    textAlign: 'center',
    fontSize: 13,
    marginBottom: 15,
    lineHeight: 20,
  },
  voiceSelectionIndicatorStrong: {
    fontWeight: '900',
    color: '#FCD34D',
  },
  primaryButton: {
    backgroundColor: '#8B5CF6',
    minHeight: 60,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  primaryButtonText: {
    color: '#FFF',
    fontWeight: '900',
    fontSize: 17,
  },
  primaryButtonTextLoading: {
    color: '#FFF',
    fontWeight: '800',
    fontSize: 15,
    marginLeft: 10,
  },
  inlineLoader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  storyResultCard: {
    backgroundColor: '#1E293B',
    borderRadius: 24,
    padding: 20,
    marginTop: 20,
    borderWidth: 1,
    borderColor: '#334155',
  },
  storyCoverImage: {
    width: '100%',
    height: 250,
    borderRadius: 16,
    marginBottom: 15,
  },
  storyTitle: {
    color: '#FFF',
    fontSize: 24,
    fontWeight: '900',
    marginBottom: 6,
  },
  storyMeta: {
    color: '#94A3B8',
    fontSize: 13,
    marginBottom: 10,
  },
  narratorBadge: {
    color: '#FCD34D',
    fontWeight: '700',
    marginBottom: 14,
    fontSize: 13,
  },
  audioButton: {
    backgroundColor: '#10B981',
    minHeight: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    paddingHorizontal: 16,
  },
  audioButtonText: {
    color: '#FFF',
    fontWeight: '800',
    fontSize: 15,
  },
  audioButtonTextLoading: {
    color: '#FFF',
    fontWeight: '800',
    fontSize: 14,
    marginLeft: 10,
  },
  secondaryButton: {
    backgroundColor: '#334155',
    minHeight: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    paddingHorizontal: 16,
  },
  secondaryButtonText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 14,
  },
  tertiaryButton: {
    backgroundColor: 'transparent',
    minHeight: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  tertiaryButtonText: {
    color: '#CBD5E1',
    fontWeight: '700',
    fontSize: 14,
  },
  storyText: {
    color: '#F8FAFC',
    fontSize: 17,
    lineHeight: 28,
  },
  pwOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    padding: 25,
  },
  pwContent: {
    backgroundColor: '#1E293B',
    borderRadius: 30,
    padding: 30,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  pwClose: {
    position: 'absolute',
    top: 15,
    right: 15,
    zIndex: 10,
  },
  pwTitle: {
    color: '#FCD34D',
    fontSize: 24,
    fontWeight: '900',
    marginTop: 15,
    textAlign: 'center',
  },
  pwSub: {
    color: '#CBD5E1',
    textAlign: 'center',
    marginVertical: 15,
    lineHeight: 22,
  },
  pwBtn: {
    backgroundColor: '#FCD34D',
    width: '100%',
    padding: 18,
    borderRadius: 18,
    alignItems: 'center',
    marginBottom: 10,
  },
});