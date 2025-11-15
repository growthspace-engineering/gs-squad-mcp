import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import Spinner from 'ink-spinner';
import type { Key } from 'ink';
import { AgentDTO, loadFullState } from '../db.js';

type Mode = 'view-only' | 'interactive';

export function TuiApp(props: {
  mode: Mode;
  attachedOriginatorId?: string;
  pty?: {
    onData: (cb: (data: string) => void) => void;
    write: (data: string) => void;
  };
  filters?: { originatorId?: string; workspaceId?: string };
}): JSX.Element {
  const [ state, setState ] = useState(loadFullState());
  const [ lastSeen, setLastSeen ] =
    useState<string | null>(state.maxLastActivityAt);
  const [ ptyOutput, setPtyOutput ] = useState<string>('');
  const ptyRef = useRef(props.pty);
  ptyRef.current = props.pty;

  useEffect(() => {
    const timer = setInterval(() => {
      const snapshot = loadFullState();
      if (snapshot.maxLastActivityAt !== lastSeen) {
        setState(snapshot);
        setLastSeen(snapshot.maxLastActivityAt);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [ lastSeen ]);

  useEffect(() => {
    if (props.mode === 'interactive' && ptyRef.current) {
      ptyRef.current.onData((chunk: string) => {
        setPtyOutput((prev) => (prev + chunk).slice(-4000));
      });
    }
  }, [ props.mode ]);

  useInput((input: string, key: Key) => {
    if (props.mode === 'interactive' && ptyRef.current) {
      ptyRef.current.write(input);
      if (key.return) {
        ptyRef.current.write('\r');
      }
    }
  });

  const grouped = useMemo(() => {
    const byOriginator = new Map<
      string,
      {
        session: {
          originatorId: string;
          orchestratorChatId?: string;
          workspaceId?: string;
          lastActivityAt: string;
        };
        squads: { squadId: string; label: string; createdAt: string }[];
        agents: AgentDTO[];
      }
    >();
    for (const s of state.sessions) {
      byOriginator.set(s.originatorId, {
        session: s,
        squads: [],
        agents: []
      });
    }
    for (const sq of state.squads) {
      const row = byOriginator.get(sq.originatorId);
      if (row) {
        row.squads.push({
          squadId: sq.squadId,
          label: sq.label,
          createdAt: sq.createdAt
        });
      }
    }
    for (const a of state.agents) {
      for (const row of byOriginator.values()) {
        if (row.squads.some((sq) => sq.squadId === a.squadId)) {
          row.agents.push(a);
        }
      }
    }
    let rows = Array.from(byOriginator.values());
    if (props.filters?.originatorId) {
      rows = rows.filter(
        (r) => r.session.originatorId === props.filters?.originatorId
      );
    }
    if (props.filters?.workspaceId) {
      rows = rows.filter(
        (r) => r.session.workspaceId === props.filters?.workspaceId
      );
    }
    return rows.sort((a, b) => {
      const aPinned =
        props.attachedOriginatorId &&
        a.session.originatorId === props.attachedOriginatorId
          ? -1
          : 0;
      const bPinned =
        props.attachedOriginatorId &&
        b.session.originatorId === props.attachedOriginatorId
          ? -1
          : 0;
      if (aPinned !== bPinned) return aPinned - bPinned;
      return (
        b.session.lastActivityAt.localeCompare(a.session.lastActivityAt) * -1
      );
    });
  }, [ state, props.attachedOriginatorId ]);

  function MemberCard({ agent }: { agent: AgentDTO }): JSX.Element {
    const isPending = agent.status === 'starting' || agent.status === 'running';
    const isDone = agent.status === 'done';
    const isError = agent.status === 'error';
    const icon = isPending
      ? <Spinner type="dots" />
      : isDone
      ? <Text color="green">✔</Text>
      : <Text color="red">✖</Text>;
    const headerColor = isPending ? 'yellow' : isDone ? 'green' : 'red';
    const chatId =
      'chatId' in agent
        ? (agent as unknown as { chatId?: string }).chatId
        : undefined;
    const normalizedPrompt = (agent.prompt || '').trim();
    const rawResult = (agent.result || '').trim();
    // Avoid duplicating when the engine echoes the prompt (e.g., echo template)
    const showResult = isDone && rawResult && rawResult !== normalizedPrompt;
    const summary = showResult
      ? rawResult.slice(0, 120)
      : isError
      ? (agent.error || '').slice(0, 120)
      : '';
    return (
      <Box
        borderStyle="round"
        borderColor={headerColor}
        flexDirection="column"
        paddingX={1}
        paddingY={0}
      >
        <Box>
          <Text> </Text>
          {icon}
          <Text> </Text>
          <Text color={headerColor}>{agent.roleName}</Text>
          {chatId ? <Text color="gray"> · chat: {chatId}</Text> : null}
        </Box>
        <Box marginTop={0}>
          <Text color="gray">prompt: </Text>
          <Text>{normalizedPrompt.slice(0, 160)}</Text>
        </Box>
        {summary ? (
          <Box marginTop={0}>
            <Text color={isDone ? 'green' : 'red'}>
              {isDone ? 'output: ' : ''}{summary}
            </Text>
          </Box>
        ) : null}
      </Box>
    );
  }

  function SquadColumn({
    label,
    agents
  }: {
    label: string;
    agents: AgentDTO[];
  }): JSX.Element {
    const rolesFromLabel = label
      .split('+')
      .map((s) => s.trim());
    const agentCards: JSX.Element[] =
      agents.length > 0
        ? agents.map((a) => (
            <Box key={a.agentId} marginBottom={1}>
              <MemberCard agent={a} />
            </Box>
          ))
        : rolesFromLabel.map((roleName, idx) => (
            <Box key={`placeholder-${idx}`} marginBottom={1}>
              <Box
                borderStyle="round"
                borderColor="yellow"
                flexDirection="column"
                paddingX={1}
                paddingY={0}
              >
                <Box>
                  <Text> </Text>
                  <Spinner type="dots" />
                  <Text> </Text>
                  <Text color="yellow">{roleName}</Text>
                </Box>
                <Box marginTop={0}>
                  <Text color="gray">prompt: </Text>
                  <Text color="gray">pending...</Text>
                </Box>
              </Box>
            </Box>
          ));
    const allFinished =
      agents.length > 0 &&
      agents.every((a) => a.status === 'done' || a.status === 'error');
    return (
      <Box flexDirection="column" marginRight={3} width={38}>
        <Box
          borderStyle="round"
          borderColor={allFinished ? 'green' : 'yellow'}
          paddingX={1}
        >
          <Text>
            {allFinished ? '✔' : ''} {label}{' '}
            {!allFinished ? (
              <>
                <Text> </Text>
                <Spinner type="dots" />
              </>
            ) : null}
          </Text>
        </Box>
        <Box flexDirection="column" marginTop={1}>
          {agentCards}
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" width="100%" height="100%">
      <Box>
        <Text color="cyan">gs-squad-dashboard</Text>
        <Text> · Mode: {props.mode}</Text>
      </Box>
      <Box flexDirection="column" flexGrow={1} overflow="hidden" marginTop={1}>
        {grouped.length === 0 ? (
          <Box>
            <Text color="gray">No squads recorded yet.</Text>
          </Box>
        ) : (
          <Box flexDirection="column">
            {grouped.map((row) => {
              const rowLabel =
                row.session.orchestratorChatId
                  ? `Chat: ${row.session.orchestratorChatId}`
                  : `Workspace: ${
                      row.session.workspaceId || row.session.originatorId
                    }`;
              const squadsSorted = row.squads
                .slice()
                .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
              return (
                <Box
                  key={row.session.originatorId}
                  flexDirection="column"
                  marginBottom={1}
                >
                  <Box
                    borderStyle="round"
                    borderColor="cyan"
                    paddingX={1}
                    marginBottom={1}
                  >
                    <Text bold>
                      {rowLabel}
                    </Text>
                  </Box>
                  <Box>
                    {squadsSorted.map((sq, idx) => {
                      const agentsForSquad = row.agents.filter(
                        (a) => a.squadId === sq.squadId
                      );
                      return (
                        <Box
                          key={sq.squadId}
                          flexDirection="row"
                          alignItems="center"
                        >
                          <SquadColumn
                            label={sq.label}
                            agents={agentsForSquad}
                          />
                          {idx < squadsSorted.length - 1 ? (
                            <Box marginX={1} alignItems="center">
                              <Text color="gray">→</Text>
                            </Box>
                          ) : null}
                        </Box>
                      );
                    })}
                  </Box>
                </Box>
              );
            })}
          </Box>
        )}
      </Box>
      {props.mode === 'interactive' ? (
        <Box
          borderStyle="round"
          marginTop={1}
          padding={1}
          flexDirection="column"
        >
          <Text color="green">Orchestrator</Text>
          <Text>{ptyOutput || '...'}</Text>
        </Box>
      ) : null}
    </Box>
  );
}


