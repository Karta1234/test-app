import { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { FavoriteButton } from '../components/FavoriteButton';
import { UpdatedAgo } from '../components/UpdatedAgo';
import { useFavorites } from '../hooks/useFavorites';
import { MATCHES_URL } from '../config';

type MatchStatus = 'scheduled' | 'live' | 'finished' | 'postponed' | string;

type Match = {
  id: string;
  startsAt: string | null;
  status: MatchStatus;
  minute?: number;
  home: { id: string; name: string; city: string };
  away: { id: string; name: string; city: string };
  score: { home: number; away: number } | null;
};

type MatchesResponse = {
  round: number;
  matches: Match[];
};

type Filter = 'all' | 'upcoming' | 'finished';

async function fetchMatches(): Promise<MatchesResponse> {
  const response = await fetch(MATCHES_URL);
  if (!response.ok) {
    throw new Error(`Не удалось загрузить матчи (${response.status})`);
  }

  const data: unknown = await response.json();
  if (
    typeof data !== 'object' ||
    data === null ||
    !('matches' in data) ||
    !Array.isArray(data.matches)
  ) {
    throw new Error('Сервер вернул данные в неизвестном формате');
  }

  return data as MatchesResponse;
}

const filterLabels: Record<Filter, string> = {
  all: 'Все',
  upcoming: 'Предстоящие',
  finished: 'Завершённые',
};

function statusLabel(match: Match): string {
  switch (match.status) {
    case 'scheduled':
      return 'Запланирован';
    case 'live':
      return match.minute ? `Идёт · ${match.minute}′` : 'Идёт';
    case 'finished':
      return 'Завершён';
    case 'postponed':
      return 'Перенесён';
    default:
      return 'Статус неизвестен';
  }
}

function matchDate(startsAt: string | null): string {
  if (!startsAt) return 'Дата не назначена';
  const date = new Date(startsAt);
  if (Number.isNaN(date.getTime())) return 'Дата неизвестна';
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function MatchesScreen() {
  const [filter, setFilter] = useState<Filter>('all');
  const { isFavorite, toggle } = useFavorites();
  const { data, error, isPending, isFetching, dataUpdatedAt, refetch } = useQuery({
    queryKey: ['matches'],
    queryFn: fetchMatches,
  });

  const matches = data?.matches.filter((match) => {
    if (filter === 'upcoming') {
      return match.status === 'scheduled' || match.status === 'postponed';
    }
    if (filter === 'finished') return match.status === 'finished';
    return true;
  }).sort((left, right) => {
    const statusOrder = (match: Match) =>
      match.status === 'live' ? 0 : match.status === 'finished' ? 2 : 1;
    const priorityOrder = statusOrder(left) - statusOrder(right);
    if (priorityOrder !== 0) return priorityOrder;

    const leftTime = left.startsAt ? Date.parse(left.startsAt) : Number.POSITIVE_INFINITY;
    const rightTime = right.startsAt ? Date.parse(right.startsAt) : Number.POSITIVE_INFINITY;
    const safeLeftTime = Number.isNaN(leftTime) ? Number.POSITIVE_INFINITY : leftTime;
    const safeRightTime = Number.isNaN(rightTime) ? Number.POSITIVE_INFINITY : rightTime;
    return safeLeftTime - safeRightTime;
  }) ?? [];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Матчи тура</Text>
          {data && <Text style={styles.subtitle}>Тур {data.round}</Text>}
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => void refetch()}
          disabled={isFetching}
          style={styles.refreshButton}
        >
          <Text style={styles.refreshText}>{isFetching ? 'Обновляем…' : 'Обновить'}</Text>
        </Pressable>
      </View>

      {dataUpdatedAt > 0 && (
        <UpdatedAgo since={new Date(dataUpdatedAt)} />
      )}

      <View style={styles.filters}>
        {(Object.keys(filterLabels) as Filter[]).map((key) => (
          <Pressable
            key={key}
            accessibilityRole="button"
            accessibilityState={{ selected: filter === key }}
            onPress={() => setFilter(key)}
            style={[styles.filterButton, filter === key && styles.filterButtonActive]}
          >
            <Text style={[styles.filterText, filter === key && styles.filterTextActive]}>
              {filterLabels[key]}
            </Text>
          </Pressable>
        ))}
      </View>

      {isPending ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#2563eb" />
          <Text style={styles.message}>Загружаем матчи…</Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorTitle}>Не удалось загрузить матчи</Text>
          <Text style={styles.message}>{error.message}</Text>
          <Pressable style={styles.retryButton} onPress={() => void refetch()}>
            <Text style={styles.retryText}>Повторить</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={matches}
          keyExtractor={(match) => match.id}
          contentContainerStyle={matches.length === 0 ? styles.emptyList : styles.list}
          refreshControl={
            <RefreshControl refreshing={isFetching} onRefresh={() => void refetch()} />
          }
          ListEmptyComponent={<Text style={styles.emptyText}>Матчей в этом разделе пока нет</Text>}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={[styles.status, item.status === 'live' && styles.liveStatus]}>
                  {statusLabel(item)}
                </Text>
                <FavoriteButton
                  active={isFavorite(item.id)}
                  onPress={() => toggle(item.id)}
                />
              </View>
              <View style={styles.teams}>
                <View style={styles.team}>
                  <Text style={styles.teamName}>{item.home.name}</Text>
                  <Text style={styles.city}>{item.home.city}</Text>
                </View>
                <Text style={styles.score}>
                  {item.score ? `${item.score.home} : ${item.score.away}` : '— : —'}
                </Text>
                <View style={[styles.team, styles.awayTeam]}>
                  <Text style={styles.teamName}>{item.away.name}</Text>
                  <Text style={styles.city}>{item.away.city}</Text>
                </View>
              </View>
              <Text style={styles.date}>{matchDate(item.startsAt)}</Text>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 16, paddingBottom: 8 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 24, fontWeight: '700', color: '#111827' },
  subtitle: { marginTop: 3, color: '#6b7280', fontSize: 14 },
  refreshButton: { paddingVertical: 9, paddingHorizontal: 13, borderRadius: 10, backgroundColor: '#eff6ff' },
  refreshText: { color: '#1d4ed8', fontWeight: '600' },
  filters: { flexDirection: 'row', gap: 8, marginTop: 16, marginBottom: 12 },
  filterButton: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 10, backgroundColor: '#f3f4f6' },
  filterButtonActive: { backgroundColor: '#2563eb' },
  filterText: { color: '#4b5563', fontSize: 13, fontWeight: '600' },
  filterTextActive: { color: '#fff' },
  list: { paddingBottom: 16, gap: 10 },
  emptyList: { flexGrow: 1, justifyContent: 'center', alignItems: 'center' },
  card: { padding: 15, borderRadius: 14, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#fff' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  status: { color: '#6b7280', fontSize: 13, fontWeight: '600' },
  liveStatus: { color: '#dc2626' },
  teams: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  team: { flex: 1 },
  awayTeam: { alignItems: 'flex-end' },
  teamName: { color: '#111827', fontSize: 15, fontWeight: '700' },
  city: { color: '#9ca3af', fontSize: 12, marginTop: 3 },
  score: { minWidth: 62, textAlign: 'center', color: '#111827', fontSize: 17, fontWeight: '700' },
  date: { marginTop: 13, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#f3f4f6', color: '#6b7280', fontSize: 13 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, gap: 10 },
  message: { color: '#6b7280', textAlign: 'center' },
  errorTitle: { color: '#b91c1c', fontWeight: '700', fontSize: 16 },
  retryButton: { marginTop: 6, paddingVertical: 10, paddingHorizontal: 18, borderRadius: 10, backgroundColor: '#2563eb' },
  retryText: { color: '#fff', fontWeight: '700' },
  emptyText: { color: '#6b7280', textAlign: 'center' },
});
