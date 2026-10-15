// ERD-AI-CHAT-MOBILE: Markdown seguro (subconjunto de @energyrd/core) pintado con componentes nativos. Nunca interpreta HTML; los enlaces solo
// pueden ser rutas internas permitidas (el parser descarta el resto) y se abren con `onLink`.
import { parseCopilotMarkdown, type MdInline } from '@energyrd/core';
import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, spacing } from '../../theme';

function Inline({ nodes, onLink }: { nodes: MdInline[]; onLink: (href: string) => void }) {
  return (
    <>
      {nodes.map((n, i) => {
        if (n.type === 'text') return n.text;
        if (n.type === 'code') return <Text key={i} style={s.code}>{n.text}</Text>;
        if (n.type === 'strong') return <Text key={i} style={s.strong}><Inline nodes={n.children} onLink={onLink} /></Text>;
        if (n.type === 'em') return <Text key={i} style={s.em}><Inline nodes={n.children} onLink={onLink} /></Text>;
        return (
          <Text key={i} style={s.link} accessibilityRole="link" onPress={() => onLink(n.href)}>
            <Inline nodes={n.children} onLink={onLink} />
          </Text>
        );
      })}
    </>
  );
}

export const CopilotMarkdown = memo(function CopilotMarkdown({ text, onLink }: { text: string; onLink: (href: string) => void }) {
  return (
    <View style={{ gap: spacing.sm }} testID="copilot-markdown">
      {parseCopilotMarkdown(text).map((b, i) =>
        b.type === 'heading' ? (
          <Text key={i} style={s.heading} accessibilityRole="header"><Inline nodes={b.children} onLink={onLink} /></Text>
        ) : b.type === 'paragraph' ? (
          <Text key={i} style={s.body}><Inline nodes={b.children} onLink={onLink} /></Text>
        ) : (
          <View key={i} style={{ gap: 4 }}>
            {b.items.map((item, j) => (
              <View key={j} style={s.row}>
                <Text style={s.body} importantForAccessibility="no">{b.ordered ? `${j + 1}.` : '•'}</Text>
                <Text style={[s.body, { flex: 1 }]}><Inline nodes={item} onLink={onLink} /></Text>
              </View>
            ))}
          </View>
        ),
      )}
    </View>
  );
});


const s = StyleSheet.create({
  body: { color: colors.text, fontSize: 15, lineHeight: 22 },
  heading: { color: colors.text, fontSize: 17, fontWeight: '700' },
  strong: { fontWeight: '700' },
  em: { fontStyle: 'italic' },
  code: { fontFamily: 'Courier', backgroundColor: colors.brandSoft },
  link: { color: colors.primary, textDecorationLine: 'underline' },
  row: { flexDirection: 'row', gap: 8 },
});
