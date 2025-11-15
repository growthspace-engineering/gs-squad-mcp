/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-unused-vars */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import type { Key } from 'ink';
import { AgentDTO, SquadDTO, loadFullState } from '../db.js';

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
  const [ scrollOffset, setScrollOffset ] = useState(0);
  const [ sessionIndex, setSessionIndex ] = useState(0);
  const { stdout } = useStdout();
  const terminalHeight = stdout?.rows || 24;
  const terminalWidth = stdout?.columns || 80;
  const ptyRef = useRef(props.pty);
  ptyRef.current = props.pty;

  // Debounced state update to avoid flicker
  const lastUpdateRef = useRef<number>(0);
  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();
      if (now - lastUpdateRef.current < 500) return; // Debounce rapid updates
      
      const snapshot = loadFullState();
      if (snapshot.maxLastActivityAt !== lastSeen) {
        setState(snapshot);
        setLastSeen(snapshot.maxLastActivityAt);
        lastUpdateRef.current = now;
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [ lastSeen ]);

  useEffect(() => {
    if (props.mode === 'interactive' && ptyRef.current) {
      ptyRef.current.onData((chunk: string) => {
        setPtyOutput((prev) => {
          const newOutput = prev + chunk;
          // Keep last 50 lines
          const lines = newOutput.split('\n');
          return lines.slice(-50).join('\n');
        });
      });
    }
  }, [ props.mode ]);

  useInput((input: string, key: Key) => {
    // Handle scrolling in view-only mode
    if (props.mode === 'view-only') {
      if (key.upArrow) {
        setScrollOffset((prev) => Math.max(0, prev - 1));
      } else if (key.downArrow) {
        setScrollOffset((prev) => prev + 1);
      } else if (key.leftArrow) {
        setSessionIndex((prev) => Math.max(0, prev - 1));
        setScrollOffset(0); // Reset squad scroll when changing sessions
      } else if (key.rightArrow) {
        setSessionIndex((prev) => prev + 1);
        setScrollOffset(0); // Reset squad scroll when changing sessions
      } else if (input === 'q' || (key.ctrl && input === 'c')) {
        process.exit(0);
      }
    } else if (props.mode === 'interactive' && ptyRef.current) {
      // Pass input to PTY in interactive mode
      if (key.upArrow || key.downArrow || key.leftArrow || key.rightArrow) {
        // Special handling for arrow keys in PTY
        const arrowMap: Record<string, string> = {
          upArrow: '\x1b[A',
          downArrow: '\x1b[B',
          leftArrow: '\x1b[D',
          rightArrow: '\x1b[C'
        };
        const arrow = Object.keys(arrowMap).find(k => key[k as keyof Key]);
        if (arrow) ptyRef.current.write(arrowMap[arrow]);
      } else {
        ptyRef.current.write(input);
        if (key.return) {
          ptyRef.current.write('\r');
        }
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
        squads: SquadDTO[];
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
        row.squads.push(sq);
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
    
    // Filter out sessions with no squads
    rows = rows.filter((r) => r.squads.length > 0);
    
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
  }, [ state, props.attachedOriginatorId, props.filters ]);

  function MemberCard(
    { agent, maxWidth }: { agent: AgentDTO; maxWidth: number }
  ): JSX.Element {
    const isPending = agent.status === 'starting' || agent.status === 'running';
    const isDone = agent.status === 'done';
    const isError = agent.status === 'error';
    const statusIcon = isPending ? '⋯' : isDone ? '✓' : '✗';
    const statusColor = isPending ? 'yellow' : isDone ? 'green' : 'red';
    
    // Use task if available, otherwise fall back to prompt for old data
    const displayText = (agent.task || agent.prompt || '').trim();
    
    // Word wrap the task text to multiple lines (up to 8 lines)
    const lineWidth = maxWidth - 6;
    const words = displayText.split(/\s+/);
    const lines: string[] = [];
    let currentLine = '';
    
    for (const word of words) {
      const testLine =
        currentLine.length === 0 ? word : `${currentLine} ${word}`;
      if (testLine.length <= lineWidth) {
        currentLine = testLine;
      } else {
        if (currentLine) lines.push(currentLine);
        currentLine = word;
        if (lines.length >= 7) break; // Max 8 lines total
      }
    }
    if (currentLine && lines.length < 8) lines.push(currentLine);
    
    // Add ellipsis if there's more text
    if (
      lines.length === 8 &&
      words.length > lines.join(' ').split(' ').length
    ) {
      lines[7] = lines[7].slice(0, -3) + '...';
    }
    
    const title = ` ${statusIcon} ${agent.roleName} `;
    
    return (
      <Box flexDirection="column" width={maxWidth}>
        <Box>
          <Text color={statusColor}>{title}</Text>
        </Box>
        <Box
          flexDirection="column"
          borderStyle="single"
          borderColor={statusColor}
          paddingX={1}
          paddingY={0}
        >
          <Text bold dimColor>
            task:
          </Text>
          {lines.map((line, idx) => (
            <Text key={idx} dimColor>
              {line}
            </Text>
          ))}
          {isError && agent.error ? (
            <Text color="red">{agent.error.slice(0, maxWidth - 4)}</Text>
          ) : null}
        </Box>
      </Box>
    );
  }

  function SquadRound({
    roundNumber,
    label,
    agents,
    roundWidth
  }: {
    roundNumber: number;
    label: string;
    agents: AgentDTO[];
    roundWidth: number;
  }): JSX.Element {
    const allFinished =
      agents.length > 0 &&
      agents.every((a) => a.status === 'done' || a.status === 'error');
    const inProgress = agents.length > 0 && !allFinished;
    
    const statusIcon = allFinished ? '✓' : inProgress ? '⋯' : '○';
    const statusColor =
      allFinished ? 'green' : inProgress ? 'yellow' : 'gray';
    
    const roundLabel =
      ` ${statusIcon} round ${String(roundNumber).padStart(2, '0')} `;
    
    return (
      <Box flexDirection="column" width={roundWidth} marginRight={2}>
        <Box>
          <Text color={statusColor} bold>
            {roundLabel}
          </Text>
        </Box>
        <Box
          flexDirection="column"
          borderStyle="single"
          borderColor={statusColor}
          paddingX={1}
          paddingY={0}
        >
          {agents.map((a, idx) => (
            <Box key={a.agentId} marginTop={idx > 0 ? 1 : 0}>
              <MemberCard agent={a} maxWidth={roundWidth - 4} />
            </Box>
          ))}
        </Box>
      </Box>
    );
  }

  // Calculate available space for content
  const headerHeight = 3; // Title bar + border  
  const footerHeight = props.mode === 'interactive' ? 8 : 2;
  const contentHeight = Math.max(
    10,
    terminalHeight - headerHeight - footerHeight
  );
  const contentWidth = Math.max(40, terminalWidth - 4);
  
  // Calculate how many squads can fit on screen
  // Each squad needs:
  //   title (1) + border (2) + agents * (title + border + task lines)
  // Estimate: ~15 lines per squad with 2 agents, ~12 lines for 1 agent
  const estimatedLinesPerSquad = 15;
  const sessionHeaderLines = 3;
  // -2 for padding
  const availableLines = contentHeight - sessionHeaderLines - 2;
  const squadsPerPage = Math.max(
    1,
    Math.floor(availableLines / estimatedLinesPerSquad)
  );

  // Organize squads by session
  const sessionSquads = useMemo(() => {
    const sessions: Array<{
      sessionLabel: string;
      squads: Array<{
        squad: SquadDTO;
        agents: AgentDTO[];
        roundNumber: number;
      }>;
    }> = [];
    
    grouped.forEach((row) => {
      const chatId = row.session.orchestratorChatId;
      const workspaceId =
        row.session.workspaceId || row.session.originatorId;
      const sessionLabel = chatId
        ? `Chat: ${chatId}`
        : `Workspace: ${workspaceId.slice(-30)}`;
      
      const squadsSorted = row.squads
        .slice()
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      
      const squadsInSession = squadsSorted.map((sq, idx) => {
        const agentsForSquad = row.agents.filter(
          (a) => a.squadId === sq.squadId
        );
        return {
          squad: sq,
          agents: agentsForSquad,
          roundNumber: idx + 1
        };
      });
      
      sessions.push({
        sessionLabel,
        squads: squadsInSession
      });
    });
    
    return sessions;
  }, [ grouped ]);
  
  // Get current session and its squads
  const maxSessionIndex = Math.max(0, sessionSquads.length - 1);
  const actualSessionIndex = Math.min(sessionIndex, maxSessionIndex);
  const currentSession = sessionSquads[actualSessionIndex];
  const allSquadsInSession = currentSession?.squads || [];

  // Calculate visible squads with pagination (within current session)
  const maxScrollOffset = Math.max(
    0,
    allSquadsInSession.length - squadsPerPage
  );
  const actualScrollOffset = Math.min(scrollOffset, maxScrollOffset);
  const visibleSquads = allSquadsInSession
    .slice(actualScrollOffset, actualScrollOffset + squadsPerPage);

  // Fixed round width for consistent display regardless of terminal size
  const roundWidth = 50;

  return (
    <Box
      flexDirection="column"
      height={terminalHeight}
    >
      {/* Header */}
      <Box borderStyle="double" borderColor="cyan" paddingX={1}>
        <Text bold color="cyan">
          ⚡ gs-squad-dashboard
        </Text>
        <Text dimColor> │ </Text>
        <Text color={props.mode === 'interactive' ? 'green' : 'blue'}>
          {props.mode === 'interactive' ? '🎮 Interactive' : '👁️  View Only'}
        </Text>
        <Text dimColor> │ </Text>
        <Text dimColor>
          {grouped.length} session{grouped.length !== 1 ? 's' : ''}
        </Text>
      </Box>

      {/* Main Content Area */}
      <Box 
        flexDirection="column" 
        height={contentHeight}
        overflow="hidden"
        paddingX={1}
        paddingY={1}
      >
        {grouped.length === 0 ? (
          <Box
            flexDirection="column"
            alignItems="center"
            justifyContent="center"
            height="100%"
          >
            <Text color="gray">No squads recorded yet.</Text>
            <Text dimColor>Start a squad to see it here.</Text>
          </Box>
        ) : (
          <Box flexDirection="column">
            {/* Session Header */}
            {currentSession && (
              <Box borderStyle="single" borderColor="cyan" paddingX={1} marginBottom={1}>
                <Text bold color="cyan">📋 {currentSession.sessionLabel}</Text>
                {sessionSquads.length > 1 && (
                  <Text dimColor> (Session {actualSessionIndex + 1}/{sessionSquads.length})</Text>
                )}
              </Box>
            )}

            {/* Horizontal flow of visible squads with arrows */}
            <Box flexDirection="column">
              {(() => {
                const rows: JSX.Element[] = [];
                let currentRow: JSX.Element[] = [];
                let currentWidth = 0;
                const maxRowWidth = contentWidth - 4;

                visibleSquads.forEach((item, idx) => {
                  const arrowWidth = idx < visibleSquads.length - 1 ? 5 : 0;
                  const itemWidth = roundWidth + arrowWidth;

                  // Check if we need to wrap to new row
                  if (
                    currentWidth + itemWidth > maxRowWidth &&
                    currentRow.length > 0
                  ) {
                    rows.push(
                      <Box
                        key={`row-${rows.length}`}
                        flexDirection="row"
                        marginBottom={1}
                      >
                        {currentRow}
                      </Box>
                    );
                    currentRow = [];
                    currentWidth = 0;
                  }

                  // Add squad
                  currentRow.push(
                    <SquadRound
                      key={item.squad.squadId}
                      roundNumber={item.roundNumber}
                      label={item.squad.label}
                      agents={item.agents}
                      roundWidth={roundWidth}
                    />
                  );

                  currentWidth += roundWidth;

                  // Add arrow if not last squad in visible set
                  if (idx < visibleSquads.length - 1) {
                    currentRow.push(
                      <Box
                        key={`arrow-${item.squad.squadId}`}
                        flexDirection="column"
                        justifyContent="flex-start"
                        marginTop={1}
                        width={5}
                      >
                        <Text color="cyan">--&gt;</Text>
                      </Box>
                    );
                    currentWidth += arrowWidth;
                  }
                });

                // Add remaining row
                if (currentRow.length > 0) {
                  rows.push(
                    <Box
                      key={`row-${rows.length}`}
                      flexDirection="row"
                      marginBottom={1}
                    >
                      {currentRow}
                    </Box>
                  );
                }

                return rows;
              })()}
            </Box>
          </Box>
        )}
      </Box>

      {/* Footer */}
      <Box
        borderStyle="single"
        borderColor="gray"
        paddingX={1}
        flexDirection="column"
      >
        {props.mode === 'interactive' ? (
          <>
            <Text bold color="green">
              🎭 Orchestrator Output:
            </Text>
            <Box height={5} flexDirection="column" overflow="hidden">
              {ptyOutput ? (
                ptyOutput.split('\n').slice(-4).map((line, idx) => (
                  <Text key={idx}>{line}</Text>
                ))
              ) : (
                <Text dimColor>Waiting for orchestrator output...</Text>
              )}
            </Box>
          </>
        ) : (
          <Box>
            <Text dimColor>
              {allSquadsInSession.length > squadsPerPage ? '↑↓ Scroll | ' : ''}
              {sessionSquads.length > 1 ? '←→ Sessions | ' : ''}
              q Quit
              {allSquadsInSession.length > squadsPerPage
                ? ` | Rounds ${actualScrollOffset + 1}-${Math.min(actualScrollOffset + squadsPerPage, allSquadsInSession.length)} of ${allSquadsInSession.length}`
                : ''}
            </Text>
          </Box>
        )}
      </Box>
    </Box>
  );
}


