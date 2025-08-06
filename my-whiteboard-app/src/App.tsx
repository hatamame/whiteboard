// =============================================================================
//
// Welcome to the Online Whiteboard MVP Project! (Final Fixed Version)
//
// This version fixes the Firestore "NOT_FOUND" error by ensuring the
// parent board document is created before attaching listeners.
//
// =============================================================================

import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, useParams, useNavigate } from 'react-router-dom';
import { Stage, Layer, Line, Text, Rect, Group, Arrow } from 'react-konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import Konva from 'konva';
import { create } from 'zustand';
import { nanoid } from 'nanoid';

// Firebase Imports
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, onSnapshot, collection, deleteDoc } from 'firebase/firestore';

// Icons
import { Pencil, StickyNote as StickyNoteIcon, Trash2 } from 'lucide-react';

// =============================================================================
// STEP 2: FIREBASE CONFIGURATION
// =============================================================================
const firebaseConfig = {
  apiKey: "AIzaSyBeLcJjs6igqVhq7kUfH73BaO_4NBZV2g8",
  authDomain: "whiteboard-app-3b780.firebaseapp.com",
  projectId: "whiteboard-app-3b780",
  storageBucket: "whiteboard-app-3b780.firebasestorage.app",
  messagingSenderId: "991780678472",
  appId: "1:991780678472:web:3f08a98ceead973617e17d",
  measurementId: "G-MCCE4G003R"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// =============================================================================
// STEP 3: TYPES AND STATE MANAGEMENT (ZUSTAND)
// =============================================================================
type Tool = 'pen' | 'note';

type PenData = {
  id: string;
  type: 'pen';
  points: number[];
  color: string;
  strokeWidth: number;
};

type NoteData = {
  id: string;
  type: 'note';
  x: number;
  y: number;
  text: string;
  color: string;
  width: number;
  height: number;
};

type BoardObject = PenData | NoteData;

type CursorData = {
  id:string;
  x: number;
  y: number;
  userName: string;
  color: string;
};

interface BoardState {
  tool: Tool;
  color: string;
  userId: string;
  userName: string;
  setTool: (tool: Tool) => void;
  setColor: (color: string) => void;
  setUserName: (name: string) => void;
  initUser: () => void;
}

const useStore = create<BoardState>((set) => ({
  tool: 'pen',
  color: '#000000',
  userId: '',
  userName: 'Anonymous',
  setTool: (tool) => set({ tool }),
  setColor: (color) => set({ color }),
  setUserName: (name) => {
    localStorage.setItem('userName', name);
    set({ userName: name });
  },
  initUser: () => {
    let userId = localStorage.getItem('userId');
    if (!userId) {
      userId = nanoid();
      localStorage.setItem('userId', userId);
    }
    const userName = localStorage.getItem('userName') || `User-${userId.substring(0, 4)}`;
    set({ userId, userName });
  },
}));

// =============================================================================
// STEP 4: REACT-KONVA COMPONENTS
// =============================================================================
const Pen = ({ points, color, strokeWidth }: Omit<PenData, 'id' | 'type'>) => (
  <Line points={points} stroke={color} strokeWidth={strokeWidth} tension={0.5} lineCap="round" lineJoin="round" />
);

const StickyNoteComponent = ({ x, y, color, width, height, onDragEnd, onDblClick, onClick, selected }: Omit<NoteData, 'id' | 'type' | 'text'> & { onDragEnd: (e: any) => void, onDblClick: (e: any) => void, onClick: (e: any) => void, selected: boolean }) => (
    <Rect
      x={x}
      y={y}
      width={width}
      height={height}
      fill={color}
      shadowBlur={10}
      shadowOpacity={0.5}
      draggable
      onDragEnd={onDragEnd}
      onDblClick={onDblClick}
      onClick={onClick}
      stroke={selected ? '#007AFF' : 'transparent'}
      strokeWidth={selected ? 3 : 0}
    />
);

const Cursor = ({ x, y, userName, color }: Omit<CursorData, 'id'>) => (
  <Group x={x} y={y}>
    <Arrow points={[0, 0, 15, 15]} fill={color} stroke={color} strokeWidth={2} pointerLength={5} pointerWidth={5} />
    <Text text={userName} fill={color} fontSize={14} offsetX={-18} offsetY={-25} fontFamily='sans-serif'/>
  </Group>
);

// =============================================================================
// STEP 5: THE MAIN WHITEBOARD COMPONENT
// =============================================================================
const Board: React.FC = () => {
  const { boardId } = useParams<{ boardId: string }>();
  const { tool, color, userId, userName, initUser } = useStore();
  const [objects, setObjects] = useState<Record<string, BoardObject>>({});
  const [cursors, setCursors] = useState<Record<string, CursorData>>({});
  const [selectedObject, setSelectedObject] = useState<string | null>(null);
  
  const isDrawing = useRef(false);
  const currentDrawingId = useRef<string | null>(null);
  const stageRef = useRef<Konva.Stage>(null);
  
  useEffect(() => {
    initUser();
  }, [initUser]);

  useEffect(() => {
    if (!boardId || !userId) return;

    // **THE FIX**: Ensure the parent board document exists before attaching listeners.
    // This creates the document if it's missing, without overwriting it.
    const boardDocRef = doc(db, 'boards', boardId);
    setDoc(boardDocRef, { lastAccessed: new Date() }, { merge: true });

    // Now that we know the parent document exists, we can safely get references
    // to its subcollections.
    const objectsCollectionRef = collection(boardDocRef, 'objects');
    const cursorsCollectionRef = collection(boardDocRef, 'cursors');

    const unsubscribeObjects = onSnapshot(objectsCollectionRef, (snapshot) => {
      const newObjects: Record<string, BoardObject> = {};
      snapshot.forEach((doc) => {
        newObjects[doc.id] = doc.data() as BoardObject;
      });
      setObjects(newObjects);
    });

    const unsubscribeCursors = onSnapshot(cursorsCollectionRef, (snapshot) => {
      const newCursors: Record<string, CursorData> = {};
      snapshot.forEach((doc) => {
        if (doc.id !== userId) {
          newCursors[doc.id] = doc.data() as CursorData;
        }
      });
      setCursors(newCursors);
    });

    return () => {
      unsubscribeObjects();
      unsubscribeCursors();
      if (userId) {
        deleteDoc(doc(cursorsCollectionRef, userId));
      }
    };
  }, [boardId, userId]);

  const updateObjectInDb = async (object: BoardObject) => {
    if (!boardId) return;
    const objectsCollectionRef = collection(db, 'boards', boardId, 'objects');
    await setDoc(doc(objectsCollectionRef, object.id), object);
  };

  const deleteObjectFromDb = async (objectId: string) => {
    if (!boardId) return;
    const objectDocRef = doc(db, 'boards', boardId, 'objects', objectId);
    await deleteDoc(objectDocRef);
  };

  const handleMouseDown = (e: KonvaEventObject<MouseEvent>) => {
    if (e.target !== e.target.getStage()) {
        const id = e.target.attrs.id || e.target.parent?.attrs.id;
        if(id) {
          setSelectedObject(id);
        }
        return;
    }
    setSelectedObject(null);

    const pos = e.target.getStage()!.getPointerPosition();
    if (!pos) return;
    
    isDrawing.current = true;
    
    if (tool === 'pen') {
      const newPen: PenData = {
        id: nanoid(),
        type: 'pen',
        points: [pos.x, pos.y],
        color: color,
        strokeWidth: 5,
      };
      currentDrawingId.current = newPen.id;
      setObjects(prev => ({ ...prev, [newPen.id]: newPen }));
    }
  };

  const handleMouseMove = (e: KonvaEventObject<MouseEvent>) => {
    const pos = e.target.getStage()!.getPointerPosition();
    if (!pos) return;

    if (userId && userName && boardId) {
      const cursorDocRef = doc(db, 'boards', boardId, 'cursors', userId);
      const cursorData: CursorData = { id: userId, x: pos.x, y: pos.y, userName, color };
      setDoc(cursorDocRef, cursorData, { merge: true });
    }
    
    if (!isDrawing.current || !currentDrawingId.current) return;
    
    if (tool === 'pen') {
        const currentPen = objects[currentDrawingId.current];
        if (currentPen && currentPen.type === 'pen') {
            const newPoints = currentPen.points.concat([pos.x, pos.y]);
            const updatedPen = { ...currentPen, points: newPoints };
            setObjects(prev => ({ ...prev, [updatedPen.id]: updatedPen }));
        }
    }
  };

  const handleMouseUp = () => {
    isDrawing.current = false;
    if (currentDrawingId.current && objects[currentDrawingId.current]) {
        updateObjectInDb(objects[currentDrawingId.current]);
    }
    currentDrawingId.current = null;
  };
  
  const handleStageClick = (e: KonvaEventObject<MouseEvent>) => {
    if (e.target !== e.target.getStage()) return;
    
    if (tool === 'note') {
      const pos = e.target.getStage()!.getPointerPosition();
      if (!pos) return;
      const newNote: NoteData = {
        id: nanoid(),
        type: 'note',
        x: pos.x - 75,
        y: pos.y - 50,
        text: 'New Note',
        color: '#FFFACD',
        width: 150,
        height: 100,
      };
      updateObjectInDb(newNote);
    }
    setSelectedObject(null);
  };

  const handleNoteDragEnd = (e: KonvaEventObject<DragEvent>, id: string) => {
    const note = objects[id];
    if (note && note.type === 'note') {
      const updatedNote = { ...note, x: e.target.x(), y: e.target.y() };
      updateObjectInDb(updatedNote);
    }
  };
  
  const handleNoteDblClick = (id: string) => {
    const note = objects[id];
    if (note && note.type === 'note') {
        const newText = prompt('Enter new text for the note:', note.text);
        if (newText !== null) {
            const updatedNote = { ...note, text: newText };
            updateObjectInDb(updatedNote);
        }
    }
  };

  const handleDeleteSelected = () => {
    if (selectedObject) {
      deleteObjectFromDb(selectedObject);
      setSelectedObject(null);
    }
  };

  return (
    <div className="w-screen h-screen flex flex-col overflow-hidden">
      <Toolbar onDelete={handleDeleteSelected} canDelete={!!selectedObject} />
      <div className="flex-grow bg-gray-100">
        <Stage
          width={window.innerWidth}
          height={window.innerHeight - 50}
          onMouseDown={handleMouseDown}
          onMousemove={handleMouseMove}
          onMouseup={handleMouseUp}
          onClick={handleStageClick}
          ref={stageRef}
        >
          <Layer>
            {Object.values(objects).map((obj) => {
              if (obj.type === 'pen') {
                return <Pen key={obj.id} {...obj} />;
              }
              if (obj.type === 'note') {
                return (
                    <Group key={obj.id} id={obj.id}>
                        <StickyNoteComponent
                            {...obj}
                            onDragEnd={(e) => handleNoteDragEnd(e, obj.id)}
                            onDblClick={() => handleNoteDblClick(obj.id)}
                            onClick={() => setSelectedObject(obj.id)}
                            selected={selectedObject === obj.id}
                        />
                        <Text
                            x={obj.x + 10}
                            y={obj.y + 10}
                            text={obj.text}
                            fontSize={16}
                            fontFamily='sans-serif'
                            width={obj.width - 20}
                            height={obj.height - 20}
                            listening={false}
                        />
                    </Group>
                );
              }
              return null;
            })}
            {Object.values(cursors).map((cursor) => (
              <Cursor key={cursor.id} {...cursor} />
            ))}
          </Layer>
        </Stage>
      </div>
    </div>
  );
};

// =============================================================================
// STEP 6: UI COMPONENTS (TOOLBAR, ETC.)
// =============================================================================
const Toolbar: React.FC<{onDelete: () => void, canDelete: boolean}> = ({ onDelete, canDelete }) => {
  const { tool, setTool, color, setColor } = useStore();

  const ToolButton = ({ myTool, children }: { myTool: Tool, children: React.ReactNode }) => (
    <button
      onClick={() => setTool(myTool)}
      className={`p-2 rounded-md ${tool === myTool ? 'bg-blue-500 text-white' : 'bg-gray-200 hover:bg-gray-300'}`}
    >
      {children}
    </button>
  );

  return (
    <header className="h-[50px] bg-white shadow-md p-2 flex items-center gap-4 z-10 flex-shrink-0">
      <h1 className="text-xl font-bold text-gray-700 mr-4">Whiteboard MVP</h1>
      <div className="flex items-center gap-2">
        <ToolButton myTool="pen"><Pencil size={20} /></ToolButton>
        <ToolButton myTool="note"><StickyNoteIcon size={20} /></ToolButton>
      </div>
      <input
        type="color"
        value={color}
        onChange={(e) => setColor(e.target.value)}
        className="ml-4 w-8 h-8 p-0 border-none bg-transparent cursor-pointer"
      />
      <div className="flex-grow" />
      <button
        onClick={onDelete}
        disabled={!canDelete}
        className="p-2 rounded-md bg-red-500 text-white disabled:bg-gray-300 disabled:cursor-not-allowed hover:bg-red-600"
        title="Delete Selected Object"
      >
        <Trash2 size={20} />
      </button>
    </header>
  );
};

const Home: React.FC = () => {
    const navigate = useNavigate();
    const { userName, setUserName, initUser } = useStore();

    useEffect(() => {
        initUser();
    }, [initUser]);

    const createNewBoard = () => {
        const newBoardId = nanoid(10);
        navigate(`/board/${newBoardId}`);
    };

    return (
        <div className="w-screen h-screen bg-gray-100 flex items-center justify-center">
            <div className="text-center bg-white p-8 rounded-lg shadow-lg max-w-md w-full mx-4">
                <h1 className="text-4xl font-bold mb-4">Real-time Whiteboard</h1>
                <p className="text-gray-600 mb-6">Create a board and share the link to collaborate.</p>
                <div className="mb-6">
                    <label htmlFor="userName" className="block text-sm font-medium text-gray-700 mb-1 text-left">Your Name</label>
                    <input
                        id="userName"
                        type="text"
                        value={userName}
                        onChange={(e) => setUserName(e.target.value)}
                        className="w-full p-2 border border-gray-300 rounded-md shadow-sm"
                        placeholder="Enter your name"
                    />
                </div>
                <button
                    onClick={createNewBoard}
                    className="w-full bg-blue-500 text-white font-bold py-3 px-6 rounded-md hover:bg-blue-600 transition-colors text-lg"
                >
                    Create New Board
                </button>
            </div>
        </div>
    );
};

// =============================================================================
// STEP 7: APP ROUTING AND ENTRY POINT
// =============================================================================
const App = () => (
  <BrowserRouter>
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/board/:boardId" element={<Board />} />
    </Routes>
  </BrowserRouter>
);

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<App />);
}

export default App;