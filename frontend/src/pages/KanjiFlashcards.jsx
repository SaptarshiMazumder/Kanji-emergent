import React, { useState, useEffect, useCallback } from 'react';
import { Eye, EyeOff, ChevronDown, Loader2, BookOpen, Filter } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
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

export default function KanjiFlashcards() {
  const [kanji, setKanji] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedLevel, setSelectedLevel] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [revealedCards, setRevealedCards] = useState({});
  const [openMnemonics, setOpenMnemonics] = useState({});

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

  useEffect(() => {
    fetchKanji();
  }, [fetchKanji]);

  const handleLevelChange = (value) => {
    setSelectedLevel(value);
    setCurrentPage(1);
  };

  const handlePageChange = (page) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
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

  const renderPaginationItems = () => {
    const items = [];
    const maxVisiblePages = 5;
    
    let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
    let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
    
    if (endPage - startPage + 1 < maxVisiblePages) {
      startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }

    if (startPage > 1) {
      items.push(
        <PaginationItem key="first">
          <PaginationLink onClick={() => handlePageChange(1)}>1</PaginationLink>
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
            isActive={i === currentPage}
            onClick={() => handlePageChange(i)}
          >
            {i}
          </PaginationLink>
        </PaginationItem>
      );
    }

    if (endPage < totalPages) {
      if (endPage < totalPages - 1) {
        items.push(
          <PaginationItem key="ellipsis-end">
            <PaginationEllipsis />
          </PaginationItem>
        );
      }
      items.push(
        <PaginationItem key="last">
          <PaginationLink onClick={() => handlePageChange(totalPages)}>
            {totalPages}
          </PaginationLink>
        </PaginationItem>
      );
    }

    return items;
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="page-header">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
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
            
            <div className="flex items-center gap-3">
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
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
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
              {kanji.map((k, index) => (
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

                      {/* Reveal Button */}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="reveal-btn flex-shrink-0"
                        onClick={() => toggleReveal(k.id)}
                        aria-label={revealedCards[k.id] ? 'Hide details' : 'Show details'}
                      >
                        {revealedCards[k.id] ? (
                          <EyeOff className="h-5 w-5" />
                        ) : (
                          <Eye className="h-5 w-5" />
                        )}
                      </Button>
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
              ))}
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
                  
                  {renderPaginationItems()}
                  
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
