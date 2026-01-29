import React, { useState, useEffect, useCallback } from 'react';
import { Eye, EyeOff, ChevronDown, Loader2, BookOpen, Filter, Search, X, RotateCcw, Check, ChevronLeft, ChevronRight, Calendar, Clock, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Checkbox } from '../components/ui/checkbox';
import { Input } from '../components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Badge } from '../components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '../components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '../components/ui/collapsible';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
  PaginationEllipsis,
} from '../components/ui/pagination';

const API_BASE_URL = process.env.REACT_APP_BACKEND_URL || '';

const JLPT_LEVELS = [
  { value: 'all', label: 'All Levels' },
  { value: 'N5', label: 'N5 (Beginner)' },
  { value: 'N4', label: 'N4 (Elementary)' },
  { value: 'N3', label: 'N3 (Intermediate)' },
  { value: 'N2', label: 'N2 (Upper Intermediate)' },
  { value: 'N1', label: 'N1 (Advanced)' },
];

const ITEMS_PER_PAGE = 20;
const REVISION_SET_SIZE = 20;
const COMPLETION_EXPIRY_DAYS = 3;

// Helper to get/set studied kanji from localStorage
const getStudiedKanji = () => {
  try {
    const stored = localStorage.getItem('studiedKanji');
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
};

const setStudiedKanjiStorage = (studied) => {
  try {
    localStorage.setItem('studiedKanji', JSON.stringify(studied));
  } catch {
    // localStorage might be full or disabled
  }
};

// Helper to get/set pending studied kanji (not yet in a revision set)
const getPendingStudied = () => {
  try {
    const stored = localStorage.getItem('pendingStudiedKanji');
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
};

const setPendingStudiedStorage = (pending) => {
  try {
    localStorage.setItem('pendingStudiedKanji', JSON.stringify(pending));
  } catch {}
};

// Helper to get/set revision sets from localStorage
const getRevisionSets = () => {
  try {
    const stored = localStorage.getItem('revisionSets');
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
};

const setRevisionSetsStorage = (sets) => {
  try {
    localStorage.setItem('revisionSets', JSON.stringify(sets));
  } catch {}
};

// Helper to get/set browse state (filter level and page per level)
const getBrowseState = () => {
  try {
    const stored = localStorage.getItem('browseState');
    return stored ? JSON.parse(stored) : { level: 'N2', pages: {} };
  } catch {
    return { level: 'N2', pages: {} };
  }
};

const setBrowseStateStorage = (state) => {
  try {
    localStorage.setItem('browseState', JSON.stringify(state));
  } catch {}
};

// Check if completion has expired (3+ days since last touched)
const isCompletionExpired = (lastTouchedDate) => {
  if (!lastTouchedDate) return true;
  const lastTouched = new Date(lastTouchedDate);
  const now = new Date();
  const diffDays = (now - lastTouched) / (1000 * 60 * 60 * 24);
  return diffDays >= COMPLETION_EXPIRY_DAYS;
};

// Format date for display
const formatDate = (dateString) => {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { 
    month: 'short', 
    day: 'numeric',
    year: 'numeric'
  });
};

// Get initial browse state from localStorage
const initialBrowseState = getBrowseState();

export default function KanjiFlashcards() {
  // Browse tab state
  const [kanji, setKanji] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedLevel, setSelectedLevel] = useState(initialBrowseState.level);
  const [currentPage, setCurrentPage] = useState(initialBrowseState.pages[initialBrowseState.level] || 1);
  const [pagesByLevel, setPagesByLevel] = useState(initialBrowseState.pages);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  
  // Search tab state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [searchPage, setSearchPage] = useState(1);
  const [searchTotalPages, setSearchTotalPages] = useState(1);
  const [searchTotalCount, setSearchTotalCount] = useState(0);
  const [hasSearched, setHasSearched] = useState(false);
  
  // Tab state
  const [activeTab, setActiveTab] = useState('browse');
  
  // Shared state
  const [revealedCards, setRevealedCards] = useState({});
  const [openMnemonics, setOpenMnemonics] = useState({});
  const [studiedKanji, setStudiedKanji] = useState(getStudiedKanji);
  
  // Revision tab state
  const [revisionSets, setRevisionSets] = useState(getRevisionSets);
  const [pendingStudied, setPendingStudied] = useState(getPendingStudied);
  const [activeRevisionSet, setActiveRevisionSet] = useState(null);
  const [currentFlashcardIndex, setCurrentFlashcardIndex] = useState(0);
  const [flippedCards, setFlippedCards] = useState({});
  const [knewItCards, setKnewItCards] = useState({});

  const fetchKanji = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const levelParam = selectedLevel !== 'all' ? `&jlpt_level=${selectedLevel}` : '';
      const response = await fetch(
        `${API_BASE_URL}/api/kanji?page=${currentPage}&per_page=${ITEMS_PER_PAGE}${levelParam}`
      );
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `Failed to fetch kanji: ${response.status}`);
      }
      
      const data = await response.json();
      setKanji(data.kanji);
      setTotalPages(data.total_pages);
      setTotalCount(data.total_count);
      
      // Reset revealed states when loading new data
      setRevealedCards({});
      setOpenMnemonics({});
    } catch (err) {
      console.error('Error fetching kanji:', err);
      setError(err.message);
      toast.error('Failed to load kanji', {
        description: err.message,
      });
    } finally {
      setLoading(false);
    }
  }, [selectedLevel, currentPage]);

  // Search function
  const searchKanji = useCallback(async (query, page = 1) => {
    if (!query.trim()) return;
    
    setSearchLoading(true);
    setSearchError(null);
    setHasSearched(true);
    
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/kanji/search?query=${encodeURIComponent(query)}&page=${page}&per_page=${ITEMS_PER_PAGE}`
      );
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `Search failed: ${response.status}`);
      }
      
      const data = await response.json();
      setSearchResults(data.kanji);
      setSearchTotalPages(data.total_pages);
      setSearchTotalCount(data.total_count);
      setSearchPage(page);
    } catch (err) {
      console.error('Error searching kanji:', err);
      setSearchError(err.message);
      toast.error('Search failed', {
        description: err.message,
      });
    } finally {
      setSearchLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchKanji();
  }, [fetchKanji]);

  // Save browse state to localStorage whenever level or page changes
  useEffect(() => {
    const newPages = { ...pagesByLevel, [selectedLevel]: currentPage };
    setPagesByLevel(newPages);
    setBrowseStateStorage({ level: selectedLevel, pages: newPages });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLevel, currentPage]);

  const handleLevelChange = (value) => {
    // Save current page for current level before switching
    const newPages = { ...pagesByLevel, [selectedLevel]: currentPage };
    setPagesByLevel(newPages);
    
    // Switch to new level and restore its saved page (or default to 1)
    setSelectedLevel(value);
    setCurrentPage(newPages[value] || 1);
  };

  const handlePageChange = (page) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleSearchPageChange = (page) => {
    if (page >= 1 && page <= searchTotalPages) {
      searchKanji(searchQuery, page);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleSearch = (e) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      setActiveTab('search');
      searchKanji(searchQuery, 1);
    }
  };

  const clearSearch = () => {
    setSearchQuery('');
    setSearchResults([]);
    setHasSearched(false);
    setActiveTab('browse');
  };

  const toggleReveal = (kanjiId) => {
    setRevealedCards((prev) => ({
      ...prev,
      [kanjiId]: !prev[kanjiId],
    }));
  };

  const toggleMnemonic = (kanjiId) => {
    setOpenMnemonics((prev) => ({
      ...prev,
      [kanjiId]: !prev[kanjiId],
    }));
  };

  // Function to create a new revision set
  const createRevisionSet = useCallback((kanjiList) => {
    const newSet = {
      id: Date.now().toString(),
      createdAt: new Date().toISOString(),
      lastTouched: new Date().toISOString(),
      kanjiIds: kanjiList,
      completed: false,
      knewIt: {}
    };
    
    setRevisionSets(prev => {
      const updated = [...prev, newSet];
      setRevisionSetsStorage(updated);
      return updated;
    });
    
    toast.success('New revision set created!', {
      description: `${kanjiList.length} kanji added to revision`
    });
    
    return newSet;
  }, []);

  const toggleStudied = (kanjiId, kanjiData = null) => {
    setStudiedKanji((prev) => {
      const wasStudied = prev[kanjiId];
      const newStudied = {
        ...prev,
        [kanjiId]: !wasStudied,
      };
      setStudiedKanjiStorage(newStudied);
      
      // If marking as studied (not unmarking), track for revision
      if (!wasStudied && kanjiData) {
        setPendingStudied(prevPending => {
          // Check if already in pending
          if (prevPending.some(k => k.id === kanjiId)) {
            return prevPending;
          }
          
          const newPending = [...prevPending, {
            id: kanjiId,
            character: kanjiData.character,
            meanings: kanjiData.meanings,
            readings: kanjiData.readings,
            vocabulary: kanjiData.vocabulary || [],
            jlpt_level: kanjiData.jlpt_level,
            level: kanjiData.level
          }];
          
          setPendingStudiedStorage(newPending);
          
          // Check if we have 20 kanji - create a revision set
          if (newPending.length >= REVISION_SET_SIZE) {
            const kanjiForSet = newPending.slice(0, REVISION_SET_SIZE);
            createRevisionSet(kanjiForSet);
            
            // Clear the used kanji from pending
            const remaining = newPending.slice(REVISION_SET_SIZE);
            setPendingStudiedStorage(remaining);
            return remaining;
          }
          
          return newPending;
        });
      }
      
      return newStudied;
    });
  };

  // Revision set functions
  const openRevisionSet = (set) => {
    // Update last touched time
    const updatedSets = revisionSets.map(s => 
      s.id === set.id 
        ? { ...s, lastTouched: new Date().toISOString() }
        : s
    );
    setRevisionSets(updatedSets);
    setRevisionSetsStorage(updatedSets);
    
    setActiveRevisionSet(set);
    setCurrentFlashcardIndex(0);
    setFlippedCards({});
    setKnewItCards(set.knewIt || {});
  };

  const closeRevisionSet = () => {
    // Save knewIt state
    if (activeRevisionSet) {
      const updatedSets = revisionSets.map(s =>
        s.id === activeRevisionSet.id
          ? { ...s, knewIt: knewItCards, lastTouched: new Date().toISOString() }
          : s
      );
      setRevisionSets(updatedSets);
      setRevisionSetsStorage(updatedSets);
    }
    
    setActiveRevisionSet(null);
    setCurrentFlashcardIndex(0);
    setFlippedCards({});
  };

  const toggleFlipCard = (kanjiId) => {
    setFlippedCards(prev => ({
      ...prev,
      [kanjiId]: !prev[kanjiId]
    }));
  };

  const toggleKnewIt = (kanjiId) => {
    setKnewItCards(prev => {
      const newKnewIt = {
        ...prev,
        [kanjiId]: !prev[kanjiId]
      };
      
      // Also update the revision set
      if (activeRevisionSet) {
        const updatedSets = revisionSets.map(s =>
          s.id === activeRevisionSet.id
            ? { ...s, knewIt: newKnewIt, lastTouched: new Date().toISOString() }
            : s
        );
        setRevisionSets(updatedSets);
        setRevisionSetsStorage(updatedSets);
      }
      
      return newKnewIt;
    });
  };

  const markSetComplete = (setId) => {
    const updatedSets = revisionSets.map(s =>
      s.id === setId
        ? { ...s, completed: true, lastTouched: new Date().toISOString() }
        : s
    );
    setRevisionSets(updatedSets);
    setRevisionSetsStorage(updatedSets);
    
    toast.success('Revision set marked as complete!');
  };

  const deleteRevisionSet = (setId) => {
    const updatedSets = revisionSets.filter(s => s.id !== setId);
    setRevisionSets(updatedSets);
    setRevisionSetsStorage(updatedSets);
    
    toast.success('Revision set deleted');
  };

  const nextFlashcard = () => {
    if (activeRevisionSet && currentFlashcardIndex < activeRevisionSet.kanjiIds.length - 1) {
      setCurrentFlashcardIndex(prev => prev + 1);
      setFlippedCards({});
    }
  };

  const prevFlashcard = () => {
    if (currentFlashcardIndex > 0) {
      setCurrentFlashcardIndex(prev => prev - 1);
      setFlippedCards({});
    }
  };

  // Check for expired completions on mount
  useEffect(() => {
    const updatedSets = revisionSets.map(s => {
      if (s.completed && isCompletionExpired(s.lastTouched)) {
        return { ...s, completed: false };
      }
      return s;
    });
    
    const hasChanges = updatedSets.some((s, i) => s.completed !== revisionSets[i]?.completed);
    if (hasChanges) {
      setRevisionSets(updatedSets);
      setRevisionSetsStorage(updatedSets);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getPrimaryMeaning = (meanings) => {
    const primary = meanings.find((m) => m.primary);
    return primary ? primary.meaning : meanings[0]?.meaning || '';
  };

  const getPrimaryReading = (readings, type) => {
    const filtered = readings.filter((r) => r.type === type);
    const primary = filtered.find((r) => r.primary);
    return primary ? primary.reading : filtered[0]?.reading || '';
  };

  const getJlptBadgeClass = (level) => {
    const classes = {
      N5: 'jlpt-n5',
      N4: 'jlpt-n4',
      N3: 'jlpt-n3',
      N2: 'jlpt-n2',
      N1: 'jlpt-n1',
    };
    return classes[level] || 'jlpt-n5';
  };

  // Reusable pagination renderer
  const renderPaginationItems = (currentPg, totalPgs, onPageChange) => {
    const items = [];
    const maxVisiblePages = 5;
    
    let startPage = Math.max(1, currentPg - Math.floor(maxVisiblePages / 2));
    let endPage = Math.min(totalPgs, startPage + maxVisiblePages - 1);
    
    if (endPage - startPage + 1 < maxVisiblePages) {
      startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }

    if (startPage > 1) {
      items.push(
        <PaginationItem key="first">
          <PaginationLink onClick={() => onPageChange(1)}>1</PaginationLink>
        </PaginationItem>
      );
      if (startPage > 2) {
        items.push(
          <PaginationItem key="ellipsis-start">
            <PaginationEllipsis />
          </PaginationItem>
        );
      }
    }

    for (let i = startPage; i <= endPage; i++) {
      items.push(
        <PaginationItem key={i}>
          <PaginationLink
            isActive={i === currentPg}
            onClick={() => onPageChange(i)}
          >
            {i}
          </PaginationLink>
        </PaginationItem>
      );
    }

    if (endPage < totalPgs) {
      if (endPage < totalPgs - 1) {
        items.push(
          <PaginationItem key="ellipsis-end">
            <PaginationEllipsis />
          </PaginationItem>
        );
      }
      items.push(
        <PaginationItem key="last">
          <PaginationLink onClick={() => onPageChange(totalPgs)}>
            {totalPgs}
          </PaginationLink>
        </PaginationItem>
      );
    }

    return items;
  };

  // Reusable kanji card renderer
  const renderKanjiCard = (k, index) => (
    <Card
      key={k.id}
      className="kanji-card overflow-hidden animate-fade-in"
      style={{ animationDelay: `${index * 30}ms` }}
    >
      <CardContent className="p-0">
        {/* Main Kanji Row */}
        <div className="p-5 flex items-center gap-4">
          {/* Kanji Character */}
          <div className="flex-shrink-0 w-20 h-20 flex items-center justify-center bg-secondary/50 rounded-xl">
            <span className="text-5xl kanji-display text-foreground">
              {k.character}
            </span>
          </div>

          {/* Kanji Info */}
          <div className="flex-grow min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <span className={`jlpt-badge ${getJlptBadgeClass(k.jlpt_level)}`}>
                {k.jlpt_level}
              </span>
              <span className="text-xs text-muted-foreground">
                Level {k.level}
              </span>
            </div>

            {/* Revealed Content */}
            {revealedCards[k.id] ? (
              <div className="animate-fade-in">
                <p className="font-medium text-foreground mb-1">
                  {getPrimaryMeaning(k.meanings)}
                </p>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm mb-3">
                  {getPrimaryReading(k.readings, 'onyomi') && (
                    <span className="text-muted-foreground">
                      <span className="text-accent">音</span>{' '}
                      {getPrimaryReading(k.readings, 'onyomi')}
                    </span>
                  )}
                  {getPrimaryReading(k.readings, 'kunyomi') && (
                    <span className="text-muted-foreground">
                      <span className="text-primary">訓</span>{' '}
                      {getPrimaryReading(k.readings, 'kunyomi')}
                    </span>
                  )}
                </div>
                {/* Vocabulary words using this kanji */}
                {k.vocabulary && k.vocabulary.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-border/50">
                    <p className="text-xs text-muted-foreground mb-1.5">Words using this kanji:</p>
                    <div className="flex flex-wrap gap-1.5">
                      {k.vocabulary.map((vocab) => (
                        <span
                          key={vocab.id}
                          className="inline-flex items-center gap-1.5 px-2 py-1 bg-secondary/70 rounded text-xs"
                        >
                          <span className="font-japanese font-medium text-foreground">{vocab.characters}</span>
                          <span className="text-muted-foreground">({vocab.readings[0]})</span>
                          <span className="text-foreground/80">- {vocab.meanings[0]}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">
                Click the eye to reveal meaning & reading
              </p>
            )}
          </div>

          {/* Reveal Button and Studied Checkbox */}
          <div className="flex flex-col items-center gap-2 flex-shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className="reveal-btn"
              onClick={() => toggleReveal(k.id)}
              aria-label={revealedCards[k.id] ? 'Hide details' : 'Show details'}
            >
              {revealedCards[k.id] ? (
                <EyeOff className="h-5 w-5" />
              ) : (
                <Eye className="h-5 w-5" />
              )}
            </Button>
            <label className="flex items-center gap-1.5 cursor-pointer group">
              <Checkbox
                checked={studiedKanji[k.id] || false}
                onCheckedChange={() => toggleStudied(k.id, k)}
                className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
              />
              <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors">
                Studied
              </span>
            </label>
          </div>
        </div>

        {/* Mnemonic Dropdown */}
        <Collapsible
          open={openMnemonics[k.id]}
          onOpenChange={() => toggleMnemonic(k.id)}
        >
          <CollapsibleTrigger asChild>
            <button className="w-full px-5 py-3 flex items-center justify-between text-sm text-muted-foreground hover:bg-muted/50 border-t border-border transition-colors">
              <span>Mnemonic</span>
              <ChevronDown
                className={`h-4 w-4 transition-transform duration-200 ${
                  openMnemonics[k.id] ? 'rotate-180' : ''
                }`}
              />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="px-5 pb-5">
              {/* Radicals Section */}
              {k.radicals && k.radicals.length > 0 && (
                <div className="mnemonic-content mb-3">
                  <p className="font-medium text-foreground text-sm mb-2">
                    Radicals
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {k.radicals.map((radical) => (
                      <span
                        key={radical.id}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-accent/10 border border-accent/20 rounded-md text-sm"
                      >
                        {radical.character ? (
                          <span className="font-japanese text-base text-accent">{radical.character}</span>
                        ) : (
                          <span className="text-accent">◯</span>
                        )}
                        <span className="text-foreground font-medium">{radical.meaning}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {k.meaning_mnemonic && (
                <div className="mnemonic-content">
                  <p className="font-medium text-foreground text-sm mb-2">
                    Meaning Mnemonic
                  </p>
                  <p
                    className="text-muted-foreground"
                    dangerouslySetInnerHTML={{
                      __html: k.meaning_mnemonic.replace(
                        /<radical>|<kanji>|<vocabulary>|<reading>/g,
                        '<span class="text-accent font-medium">'
                      ).replace(
                        /<\/radical>|<\/kanji>|<\/vocabulary>|<\/reading>/g,
                        '</span>'
                      ),
                    }}
                  />
                </div>
              )}
              {k.reading_mnemonic && (
                <div className="mnemonic-content mt-3">
                  <p className="font-medium text-foreground text-sm mb-2">
                    Reading Mnemonic
                  </p>
                  <p
                    className="text-muted-foreground"
                    dangerouslySetInnerHTML={{
                      __html: k.reading_mnemonic.replace(
                        /<radical>|<kanji>|<vocabulary>|<reading>/g,
                        '<span class="text-accent font-medium">'
                      ).replace(
                        /<\/radical>|<\/kanji>|<\/vocabulary>|<\/reading>/g,
                        '</span>'
                      ),
                    }}
                  />
                </div>
              )}
              {!k.meaning_mnemonic && !k.reading_mnemonic && (
                <p className="text-muted-foreground text-sm py-2">
                  No mnemonics available for this kanji.
                </p>
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="page-header">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col gap-4">
            {/* Top row: Title and Search */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <BookOpen className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h1 className="text-xl sm:text-2xl font-semibold text-foreground font-japanese">
                    漢字フラッシュカード
                  </h1>
                  <p className="text-sm text-muted-foreground">
                    WaniKani Kanji Flashcards
                  </p>
                </div>
              </div>
              
              {/* Search Bar */}
              <form onSubmit={handleSearch} className="flex items-center gap-2 w-full sm:w-auto">
                <div className="relative flex-grow sm:flex-grow-0 sm:w-[280px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="text"
                    placeholder="Search kanji, meaning, or reading..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 pr-8"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={clearSearch}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-muted rounded"
                    >
                      <X className="h-4 w-4 text-muted-foreground" />
                    </button>
                  )}
                </div>
                <Button type="submit" size="sm" disabled={!searchQuery.trim()}>
                  Search
                </Button>
              </form>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content with Tabs */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
            <TabsList>
              <TabsTrigger value="browse" className="gap-2">
                <BookOpen className="h-4 w-4" />
                Browse
              </TabsTrigger>
              <TabsTrigger value="search" className="gap-2" disabled={!hasSearched}>
                <Search className="h-4 w-4" />
                Search Results
                {hasSearched && searchTotalCount > 0 && (
                  <span className="ml-1 text-xs bg-primary/20 px-1.5 py-0.5 rounded">
                    {searchTotalCount}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="revisions" className="gap-2">
                <RotateCcw className="h-4 w-4" />
                Revisions
                {revisionSets.length > 0 && (
                  <span className="ml-1 text-xs bg-primary/20 px-1.5 py-0.5 rounded">
                    {revisionSets.length}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>
            
            {/* JLPT Filter - only show on Browse tab */}
            {activeTab === 'browse' && (
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <Select value={selectedLevel} onValueChange={handleLevelChange}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Select JLPT Level" />
                  </SelectTrigger>
                  <SelectContent>
                    {JLPT_LEVELS.map((level) => (
                      <SelectItem key={level.value} value={level.value}>
                        {level.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Browse Tab Content */}
          <TabsContent value="browse" className="mt-0">
            {/* Stats Bar */}
            {!loading && !error && (
              <div className="mb-6 flex items-center justify-between text-sm text-muted-foreground">
                <span>
                  Showing {kanji.length} of {totalCount} kanji
                  {selectedLevel !== 'all' && ` (${selectedLevel})`}
                </span>
                <span>
                  Page {currentPage} of {totalPages}
                </span>
              </div>
            )}

            {/* Loading State */}
            {loading && (
              <div className="flex flex-col items-center justify-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
                <p className="text-muted-foreground">Loading kanji...</p>
              </div>
            )}

            {/* Error State */}
            {error && !loading && (
              <div className="flex flex-col items-center justify-center py-20">
                <div className="bg-destructive/10 text-destructive rounded-lg p-6 max-w-md text-center">
                  <p className="font-medium mb-2">Failed to load kanji</p>
                  <p className="text-sm mb-4">{error}</p>
                  <Button onClick={fetchKanji} variant="outline">
                    Try Again
                  </Button>
                </div>
              </div>
            )}

            {/* Kanji Grid */}
            {!loading && !error && kanji.length > 0 && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
                  {kanji.map((k, index) => renderKanjiCard(k, index))}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <Pagination className="mt-8">
                    <PaginationContent>
                      <PaginationItem>
                        <PaginationPrevious
                          onClick={() => handlePageChange(currentPage - 1)}
                          className={currentPage === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                        />
                      </PaginationItem>
                      
                      {renderPaginationItems(currentPage, totalPages, handlePageChange)}
                      
                      <PaginationItem>
                        <PaginationNext
                          onClick={() => handlePageChange(currentPage + 1)}
                          className={currentPage === totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                        />
                      </PaginationItem>
                    </PaginationContent>
                  </Pagination>
                )}
              </>
            )}

            {/* Empty State */}
            {!loading && !error && kanji.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="p-4 bg-muted rounded-full mb-4">
                  <BookOpen className="h-8 w-8 text-muted-foreground" />
                </div>
                <p className="text-lg font-medium text-foreground mb-2">
                  No kanji found
                </p>
                <p className="text-muted-foreground max-w-sm">
                  {selectedLevel !== 'all'
                    ? `No kanji available for ${selectedLevel} level. Try selecting a different level.`
                    : 'No kanji available. Please check your WaniKani API configuration.'}
                </p>
              </div>
            )}
          </TabsContent>

          {/* Search Tab Content */}
          <TabsContent value="search" className="mt-0">
            {/* Search Stats Bar */}
            {!searchLoading && !searchError && hasSearched && (
              <div className="mb-6 flex items-center justify-between text-sm text-muted-foreground">
                <span>
                  Found {searchTotalCount} kanji matching "{searchQuery}"
                </span>
                {searchTotalPages > 1 && (
                  <span>
                    Page {searchPage} of {searchTotalPages}
                  </span>
                )}
              </div>
            )}

            {/* Search Loading State */}
            {searchLoading && (
              <div className="flex flex-col items-center justify-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
                <p className="text-muted-foreground">Searching kanji...</p>
              </div>
            )}

            {/* Search Error State */}
            {searchError && !searchLoading && (
              <div className="flex flex-col items-center justify-center py-20">
                <div className="bg-destructive/10 text-destructive rounded-lg p-6 max-w-md text-center">
                  <p className="font-medium mb-2">Search failed</p>
                  <p className="text-sm mb-4">{searchError}</p>
                  <Button onClick={() => searchKanji(searchQuery, 1)} variant="outline">
                    Try Again
                  </Button>
                </div>
              </div>
            )}

            {/* Search Results Grid */}
            {!searchLoading && !searchError && searchResults.length > 0 && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
                  {searchResults.map((k, index) => renderKanjiCard(k, index))}
                </div>

                {/* Search Pagination */}
                {searchTotalPages > 1 && (
                  <Pagination className="mt-8">
                    <PaginationContent>
                      <PaginationItem>
                        <PaginationPrevious
                          onClick={() => handleSearchPageChange(searchPage - 1)}
                          className={searchPage === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                        />
                      </PaginationItem>
                      
                      {renderPaginationItems(searchPage, searchTotalPages, handleSearchPageChange)}
                      
                      <PaginationItem>
                        <PaginationNext
                          onClick={() => handleSearchPageChange(searchPage + 1)}
                          className={searchPage === searchTotalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                        />
                      </PaginationItem>
                    </PaginationContent>
                  </Pagination>
                )}
              </>
            )}

            {/* No Search Results */}
            {!searchLoading && !searchError && hasSearched && searchResults.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="p-4 bg-muted rounded-full mb-4">
                  <Search className="h-8 w-8 text-muted-foreground" />
                </div>
                <p className="text-lg font-medium text-foreground mb-2">
                  No results found
                </p>
                <p className="text-muted-foreground max-w-sm">
                  No kanji found matching "{searchQuery}". Try a different search term.
                </p>
              </div>
            )}

            {/* Initial Search State */}
            {!hasSearched && (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="p-4 bg-muted rounded-full mb-4">
                  <Search className="h-8 w-8 text-muted-foreground" />
                </div>
                <p className="text-lg font-medium text-foreground mb-2">
                  Search for kanji
                </p>
                <p className="text-muted-foreground max-w-sm">
                  Use the search bar above to find kanji by character, meaning, or reading.
                </p>
              </div>
            )}
          </TabsContent>

          {/* Revisions Tab Content */}
          <TabsContent value="revisions" className="mt-0">
            {activeRevisionSet ? (
              // Flashcard View
              <div className="max-w-2xl mx-auto">
                {/* Header with back button */}
                <div className="flex items-center justify-between mb-6">
                  <Button variant="ghost" onClick={closeRevisionSet} className="gap-2">
                    <ChevronLeft className="h-4 w-4" />
                    Back to Sets
                  </Button>
                  <div className="text-sm text-muted-foreground">
                    {currentFlashcardIndex + 1} / {activeRevisionSet.kanjiIds.length}
                  </div>
                </div>

                {/* Flashcard */}
                {activeRevisionSet.kanjiIds[currentFlashcardIndex] && (
                  <div className="mb-6">
                    <div
                      onClick={() => toggleFlipCard(activeRevisionSet.kanjiIds[currentFlashcardIndex].id)}
                      className={`
                        relative cursor-pointer perspective-1000
                        transition-transform duration-500 transform-style-preserve-3d
                        ${flippedCards[activeRevisionSet.kanjiIds[currentFlashcardIndex].id] ? 'rotate-y-180' : ''}
                      `}
                      style={{ minHeight: '320px' }}
                    >
                      {/* Front of card */}
                      <Card className={`
                        absolute inset-0 backface-hidden
                        ${flippedCards[activeRevisionSet.kanjiIds[currentFlashcardIndex].id] ? 'invisible' : ''}
                      `}>
                        <CardContent className="h-full flex flex-col items-center justify-center p-8">
                          <span className="text-8xl font-japanese mb-4">
                            {activeRevisionSet.kanjiIds[currentFlashcardIndex].character}
                          </span>
                          <div className="flex items-center gap-2 mt-4">
                            <Badge variant="outline" className={`jlpt-badge ${getJlptBadgeClass(activeRevisionSet.kanjiIds[currentFlashcardIndex].jlpt_level)}`}>
                              {activeRevisionSet.kanjiIds[currentFlashcardIndex].jlpt_level}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              Level {activeRevisionSet.kanjiIds[currentFlashcardIndex].level}
                            </span>
                          </div>
                          <p className="text-sm text-muted-foreground mt-6">
                            Click to reveal meaning
                          </p>
                        </CardContent>
                      </Card>

                      {/* Back of card */}
                      <Card className={`
                        absolute inset-0 backface-hidden rotate-y-180
                        ${!flippedCards[activeRevisionSet.kanjiIds[currentFlashcardIndex].id] ? 'invisible' : ''}
                      `}>
                        <CardContent className="h-full flex flex-col items-center justify-center p-8">
                          <span className="text-5xl font-japanese mb-4">
                            {activeRevisionSet.kanjiIds[currentFlashcardIndex].character}
                          </span>
                          <p className="text-2xl font-semibold text-foreground mb-2">
                            {getPrimaryMeaning(activeRevisionSet.kanjiIds[currentFlashcardIndex].meanings)}
                          </p>
                          <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-sm mb-4">
                            {getPrimaryReading(activeRevisionSet.kanjiIds[currentFlashcardIndex].readings, 'onyomi') && (
                              <span className="text-muted-foreground">
                                <span className="text-accent">音</span>{' '}
                                {getPrimaryReading(activeRevisionSet.kanjiIds[currentFlashcardIndex].readings, 'onyomi')}
                              </span>
                            )}
                            {getPrimaryReading(activeRevisionSet.kanjiIds[currentFlashcardIndex].readings, 'kunyomi') && (
                              <span className="text-muted-foreground">
                                <span className="text-primary">訓</span>{' '}
                                {getPrimaryReading(activeRevisionSet.kanjiIds[currentFlashcardIndex].readings, 'kunyomi')}
                              </span>
                            )}
                          </div>
                          {/* Vocabulary */}
                          {activeRevisionSet.kanjiIds[currentFlashcardIndex].vocabulary?.length > 0 && (
                            <div className="mt-2 pt-4 border-t border-border w-full">
                              <p className="text-xs text-muted-foreground mb-2 text-center">Words:</p>
                              <div className="flex flex-wrap justify-center gap-1.5">
                                {activeRevisionSet.kanjiIds[currentFlashcardIndex].vocabulary.slice(0, 3).map((vocab, idx) => (
                                  <span
                                    key={idx}
                                    className="inline-flex items-center gap-1 px-2 py-1 bg-secondary/70 rounded text-xs"
                                  >
                                    <span className="font-japanese">{vocab.characters}</span>
                                    <span className="text-muted-foreground">- {vocab.meanings[0]}</span>
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                          <p className="text-sm text-muted-foreground mt-4">
                            Click to flip back
                          </p>
                        </CardContent>
                      </Card>
                    </div>

                    {/* Knew It Checkbox */}
                    <div className="flex items-center justify-center mt-6">
                      <label className="flex items-center gap-2 cursor-pointer p-3 rounded-lg hover:bg-muted transition-colors">
                        <Checkbox
                          checked={knewItCards[activeRevisionSet.kanjiIds[currentFlashcardIndex].id] || false}
                          onCheckedChange={() => toggleKnewIt(activeRevisionSet.kanjiIds[currentFlashcardIndex].id)}
                          className="h-5 w-5 data-[state=checked]:bg-green-600 data-[state=checked]:border-green-600"
                        />
                        <span className="text-sm font-medium">I knew this kanji</span>
                      </label>
                    </div>
                  </div>
                )}

                {/* Navigation */}
                <div className="flex items-center justify-between">
                  <Button
                    variant="outline"
                    onClick={prevFlashcard}
                    disabled={currentFlashcardIndex === 0}
                    className="gap-2"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Previous
                  </Button>
                  
                  {currentFlashcardIndex === activeRevisionSet.kanjiIds.length - 1 ? (
                    <Button
                      onClick={() => {
                        markSetComplete(activeRevisionSet.id);
                        closeRevisionSet();
                      }}
                      className="gap-2 bg-green-600 hover:bg-green-700"
                    >
                      <Check className="h-4 w-4" />
                      Mark Complete
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      onClick={nextFlashcard}
                      className="gap-2"
                    >
                      Next
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  )}
                </div>

                {/* Progress dots */}
                <div className="flex justify-center gap-1.5 mt-6 flex-wrap">
                  {activeRevisionSet.kanjiIds.map((k, idx) => (
                    <button
                      key={k.id}
                      onClick={() => {
                        setCurrentFlashcardIndex(idx);
                        setFlippedCards({});
                      }}
                      className={`
                        w-3 h-3 rounded-full transition-all
                        ${idx === currentFlashcardIndex ? 'bg-primary scale-125' : 
                          knewItCards[k.id] ? 'bg-green-500' : 'bg-muted-foreground/30'}
                      `}
                    />
                  ))}
                </div>
              </div>
            ) : (
              // Revision Sets List
              <>
                {/* Pending indicator */}
                {pendingStudied.length > 0 && (
                  <div className="mb-6 p-4 bg-muted/50 rounded-lg border border-border">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          Building next revision set...
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {pendingStudied.length} / {REVISION_SET_SIZE} kanji studied
                        </p>
                      </div>
                      <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-primary transition-all"
                          style={{ width: `${(pendingStudied.length / REVISION_SET_SIZE) * 100}%` }}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Revision Sets Grid */}
                {revisionSets.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {revisionSets.map((set, index) => {
                      const knewCount = Object.values(set.knewIt || {}).filter(Boolean).length;
                      const isExpired = set.completed && isCompletionExpired(set.lastTouched);
                      const displayCompleted = set.completed && !isExpired;
                      
                      return (
                        <Card 
                          key={set.id}
                          className={`cursor-pointer transition-all hover:shadow-lg ${
                            displayCompleted ? 'border-green-500/50 bg-green-500/5' : ''
                          }`}
                          onClick={() => openRevisionSet(set)}
                        >
                          <CardContent className="p-5">
                            <div className="flex items-start justify-between mb-3">
                              <div>
                                <div className="flex items-center gap-2 mb-1">
                                  <Calendar className="h-4 w-4 text-muted-foreground" />
                                  <span className="text-sm font-medium">
                                    {formatDate(set.createdAt)}
                                  </span>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                  Set #{revisionSets.length - index}
                                </p>
                              </div>
                              <div className="flex items-center gap-2">
                                {displayCompleted && (
                                  <Badge className="bg-green-600 text-white">
                                    <Check className="h-3 w-3 mr-1" />
                                    Complete
                                  </Badge>
                                )}
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Delete Revision Set?</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        This will permanently delete the revision set from {formatDate(set.createdAt)} with {set.kanjiIds.length} kanji. This action cannot be undone.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                                      <AlertDialogAction
                                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          deleteRevisionSet(set.id);
                                        }}
                                      >
                                        Delete
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              </div>
                            </div>
                            
                            {/* Kanji preview */}
                            <div className="flex flex-wrap gap-1 mb-3">
                              {set.kanjiIds.slice(0, 10).map(k => (
                                <span 
                                  key={k.id}
                                  className={`
                                    text-lg font-japanese px-1.5 py-0.5 rounded
                                    ${set.knewIt?.[k.id] ? 'bg-green-500/20 text-green-700' : 'bg-muted'}
                                  `}
                                >
                                  {k.character}
                                </span>
                              ))}
                              {set.kanjiIds.length > 10 && (
                                <span className="text-xs text-muted-foreground self-center ml-1">
                                  +{set.kanjiIds.length - 10} more
                                </span>
                              )}
                            </div>
                            
                            {/* Stats */}
                            <div className="flex items-center justify-between text-xs text-muted-foreground">
                              <span>{set.kanjiIds.length} kanji</span>
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                Last: {formatDate(set.lastTouched)}
                              </span>
                            </div>
                            
                            {/* Progress bar */}
                            <div className="mt-3">
                              <div className="flex justify-between text-xs mb-1">
                                <span className="text-muted-foreground">Known</span>
                                <span className="text-green-600">{knewCount}/{set.kanjiIds.length}</span>
                              </div>
                              <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                                <div 
                                  className="h-full bg-green-500 transition-all"
                                  style={{ width: `${(knewCount / set.kanjiIds.length) * 100}%` }}
                                />
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-20 text-center">
                    <div className="p-4 bg-muted rounded-full mb-4">
                      <RotateCcw className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <p className="text-lg font-medium text-foreground mb-2">
                      No revision sets yet
                    </p>
                    <p className="text-muted-foreground max-w-sm">
                      Mark {REVISION_SET_SIZE} kanji as "Studied" in the Browse tab to create your first revision set.
                    </p>
                  </div>
                )}
              </>
            )}
          </TabsContent>
        </Tabs>
      </main>

      {/* Footer */}
      <footer className="border-t border-border mt-auto">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <p className="text-sm text-muted-foreground text-center">
            Powered by WaniKani API • Built for Japanese learners
          </p>
        </div>
      </footer>
    </div>
  );
}
