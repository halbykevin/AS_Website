// Survey screen — deep-link target of feedback requests
// (/account/survey/:id?order=123). Ratings, choices and free text; one
// submission per customer per order.

import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useAccount } from '@/src/lib/account';
import { notificationsApi } from '@/src/lib/notifications';
import { useTheme } from '@/src/theme';
import { Screen, Text, Header, Card, Button, Icon, Input, EmptyState, Skeleton } from '@/src/ui';

export default function SurveyScreen() {
  const theme = useTheme();
  const account = useAccount();
  const { id, order } = useLocalSearchParams();
  const [survey, setSurvey] = useState(null);
  const [answers, setAnswers] = useState({});
  const [state, setState] = useState('loading'); // loading|ready|submitting|done|missing
  const [error, setError] = useState('');

  useEffect(() => {
    if (account?.loading) return;
    if (!account?.customer) {
      router.replace(`/auth/login?next=/account/survey/${id}${order ? `?order=${order}` : ''}`);
      return;
    }
    notificationsApi
      .getSurvey(id)
      .then(s => {
        setSurvey(s);
        setState('ready');
      })
      .catch(() => setState('missing'));
  }, [account?.loading, account?.customer, id]);

  const submit = async () => {
    setState('submitting');
    setError('');
    try {
      await notificationsApi.respondSurvey(id, order ? Number(order) : null, answers);
      setState('done');
    } catch (e) {
      setState('ready');
      if (e.status === 409) setState('done'); // already answered — treat as success
      else setError(e.message);
    }
  };

  const setAnswer = (qid, v) => setAnswers(a => ({ ...a, [qid]: v }));
  const answered = Object.keys(answers).length > 0;

  return (
    <Screen edges={['top']} contentStyle={{ paddingHorizontal: 0 }}>
      <Header title={survey?.title || 'Survey'} />
      <View style={{ paddingHorizontal: theme.layout.screenPadding, gap: theme.spacing.lg, paddingTop: theme.spacing.sm }}>
        {state === 'loading' ? (
          [0, 1].map(i => <Skeleton key={i} height={110} radius="2xl" />)
        ) : state === 'missing' ? (
          <EmptyState icon="info" title="Survey unavailable" message="This survey has closed or doesn't exist." actionLabel="Back" onAction={() => router.back()} />
        ) : state === 'done' ? (
          <EmptyState
            icon="checkCircle"
            title="Thanks for your feedback!"
            message="It helps us make AS Store better for you."
            actionLabel="Done"
            onAction={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          />
        ) : (
          <>
            {survey.intro ? (
              <Text variant="body" muted>
                {survey.intro}
              </Text>
            ) : null}
            {survey.questions.map(q => (
              <Card key={q.id} style={{ gap: theme.spacing.md }}>
                <Text variant="title">{q.label}</Text>
                {q.type === 'rating' ? (
                  <View style={{ flexDirection: 'row', gap: theme.spacing.md, justifyContent: 'center' }}>
                    {[1, 2, 3, 4, 5].map(n => (
                      <Pressable
                        key={n}
                        onPress={() => setAnswer(q.id, n)}
                        hitSlop={theme.layout.hitSlop}
                        accessibilityLabel={`${n} star${n > 1 ? 's' : ''}`}
                      >
                        <Icon
                          name={answers[q.id] >= n ? 'star' : 'starOutline'}
                          size={34}
                          color={answers[q.id] >= n ? theme.colors.primary : theme.colors.textFaint}
                        />
                      </Pressable>
                    ))}
                  </View>
                ) : q.type === 'choice' ? (
                  <View style={{ gap: theme.spacing.sm }}>
                    {(q.options || []).map(opt => {
                      const active = answers[q.id] === opt;
                      return (
                        <Pressable
                          key={opt}
                          onPress={() => setAnswer(q.id, opt)}
                          style={{
                            padding: theme.spacing.md,
                            borderRadius: theme.radii.xl,
                            borderWidth: 1,
                            borderColor: active ? theme.colors.primary : theme.colors.border,
                            backgroundColor: active ? theme.alpha(theme.colors.primary, 0.08) : 'transparent'
                          }}
                        >
                          <Text variant="body" color={active ? 'primary' : 'text'}>
                            {opt}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                ) : (
                  <Input
                    value={answers[q.id] || ''}
                    onChangeText={t => setAnswer(q.id, t)}
                    placeholder="Type your answer…"
                    multiline
                  />
                )}
              </Card>
            ))}
            {error ? (
              <Text variant="caption" style={{ color: theme.colors.danger }}>
                {error}
              </Text>
            ) : null}
            <Button
              label={state === 'submitting' ? 'Sending…' : 'Submit'}
              onPress={submit}
              disabled={!answered || state === 'submitting'}
              fullWidth
            />
          </>
        )}
      </View>
    </Screen>
  );
}
