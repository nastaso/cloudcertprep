import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useTheme } from '../hooks/useTheme'
import { KOFI_URL, GITHUB_REPO_URL } from '../lib/constants'
import { Menu, X, Heart, Cloud, Check, Sun, Moon, Github } from 'lucide-react'
import { Button } from './Button'

interface HeaderProps {
  showNav?: boolean
}

export function Header({ showNav = false }: HeaderProps) {
  const navigate = useNavigate()
  const { user, signOut } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  return (
    <header className="bg-gradient-to-r from-aws-orange to-aws-orange-end shadow-lg relative z-30">
      <div className="max-w-7xl mx-auto px-4 py-2 md:py-4 lg:py-6">
        <div className="flex items-center justify-between md:gap-3 lg:gap-0">
          {/* Logo and Title */}
          <Link to="/" className="flex items-center gap-2 md:gap-3 group">
            <div className="w-10 h-10 md:w-12 lg:w-14 md:h-12 lg:h-14 bg-white rounded-lg flex items-center justify-center shadow-md group-hover:shadow-lg transition-shadow relative">
              <Cloud className="w-6 h-6 md:w-7 md:h-7 lg:w-8 lg:h-8 text-aws-orange" fill="currentColor" />
              <Check className="w-4 h-4 md:w-5 md:h-5 lg:w-6 lg:h-6 text-white absolute" strokeWidth={3} />
            </div>
            <div>
              <span className="text-xl md:text-2xl lg:text-3xl font-bold text-white tracking-tight block">
                CloudCertPrep
              </span>
              <p className="text-xs md:text-sm text-white/90 font-medium hidden lg:block">
                AWS Certification Exam Prep
              </p>
            </div>
          </Link>
          
          {/* Hamburger Menu (Mobile) and Desktop Navigation */}
          {showNav && (
            <>
              {/* Hamburger Button - Mobile Only */}
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="md:hidden p-2 text-white hover:bg-white/10 rounded-lg transition-colors"
                aria-label="Toggle menu"
                aria-expanded={mobileMenuOpen}
                aria-controls="mobile-menu"
              >
                {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
              </button>

              {/* Desktop Navigation - Hidden on Mobile */}
              <div className="hidden md:flex items-center gap-4 lg:gap-6">
                <nav className="flex items-center gap-4 lg:gap-6">
                  {user && (
                    <Link 
                      to="/history" 
                      className="text-white/90 hover:text-white font-medium transition-colors text-base lg:text-lg"
                    >
                      History
                    </Link>
                  )}
                  {/* GitHub link signals open-source positioning at the top of
                      the funnel. Replaces the redundant 'Home' link (logo on the
                      left already routes to /). */}
                  <a
                    href={GITHUB_REPO_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-white/90 hover:text-white transition-colors p-1"
                    aria-label="View source on GitHub"
                  >
                    <Github className="w-5 h-5 lg:w-6 lg:h-6" />
                  </a>
                </nav>
                
                {user ? (
                  <button
                    onClick={() => {
                      signOut()
                      navigate('/login')
                    }}
                    className="px-5 py-3 bg-white/10 hover:bg-white/20 text-white border border-white/20 font-medium rounded-lg text-base lg:text-lg whitespace-nowrap"
                  >
                    Sign out
                  </button>
                ) : (
                  <button
                    onClick={() => navigate('/login')}
                    className="px-5 py-3 bg-white hover:bg-white/90 text-aws-orange font-medium rounded-lg text-base lg:text-lg whitespace-nowrap"
                  >
                    Sign in
                  </button>
                )}
              </div>

              {/* Mobile Menu Drawer */}
              {mobileMenuOpen && (
                <>
                  {/* Overlay */}
                  <div 
                    className="md:hidden fixed inset-0 bg-black/60 z-[100]"
                    onClick={() => setMobileMenuOpen(false)}
                  />
                  
                  {/* Drawer */}
                  <div id="mobile-menu" className="md:hidden fixed top-0 right-0 bottom-0 w-64 bg-bg-card shadow-2xl z-[101] flex flex-col">
                    {/* Drawer Header */}
                    <div className="flex items-center justify-between p-4 border-b border-text-muted/20">
                      <h2 className="text-lg font-semibold text-text-primary">Menu</h2>
                      <button
                        onClick={() => setMobileMenuOpen(false)}
                        className="p-2 text-text-muted hover:text-text-primary hover:bg-bg-dark rounded-lg transition-colors"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>

                    {/* Navigation Links */}
                    <nav className="flex flex-col p-4 gap-2">
                      {user && (
                        <Link
                          to="/history"
                          onClick={() => setMobileMenuOpen(false)}
                          className="px-4 py-3 text-text-primary hover:bg-bg-dark rounded-lg transition-colors font-medium"
                        >
                          History
                        </Link>
                      )}
                      <a
                        href={GITHUB_REPO_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => setMobileMenuOpen(false)}
                        className="px-4 py-3 text-text-primary hover:bg-bg-dark rounded-lg transition-colors font-medium flex items-center gap-3"
                      >
                        <Github className="w-5 h-5" />
                        GitHub
                      </a>
                      <button
                        onClick={toggleTheme}
                        className="px-4 py-3 text-text-primary hover:bg-bg-dark rounded-lg transition-colors font-medium flex items-center gap-3 w-full text-left"
                      >
                        {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                        {theme === 'dark' ? 'Light mode' : 'Dark mode'}
                      </button>
                    </nav>

                    {/* Auth Button */}
                    <div className="p-4 border-t border-text-muted/20">
                      {user ? (
                        <Button
                          onClick={() => {
                            signOut()
                            navigate('/login')
                            setMobileMenuOpen(false)
                          }}
                          variant="secondary"
                          fullWidth
                        >
                          Sign out
                        </Button>
                      ) : (
                        <Button
                          onClick={() => {
                            navigate('/login')
                            setMobileMenuOpen(false)
                          }}
                          variant="primary"
                          fullWidth
                          className="shadow-lg"
                        >
                          Sign in
                        </Button>
                      )}
                    </div>

                    {/* Spacer to push donate link to bottom */}
                    <div className="flex-1"></div>

                    {/* Donate Link - Bottom of Drawer */}
                    <div className="p-4 border-t border-text-muted/20">
                      <a 
                        href={KOFI_URL}
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="flex items-center justify-center gap-2 text-text-muted hover:text-aws-orange transition-colors text-sm"
                      >
                        <Heart className="w-4 h-4" />
                        Support the developer
                      </a>
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </header>
  )
}
