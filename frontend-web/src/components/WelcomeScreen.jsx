import React, { useState, useEffect } from 'react';
import { supabase } from '../../../shared/supabase';
import '../styles/WelcomeScreen.css';

const WelcomeScreen = ({ toggleTheme, isDarkMode, onSetupComplete }) => {
  const [userFullName, setUserFullName] = useState('User');
  const [profileType, setProfileType] = useState('INDIVIDUAL'); // INDIVIDUAL or BUSINESS
  const [modules, setModules] = useState([]);
  const [selectedModuleId, setSelectedModuleId] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        setLoading(true);
        const { data: { user } } = await supabase.auth.getUser();

        if (user) {
          if (user.user_metadata?.full_name) {
            const firstName = user.user_metadata.full_name.split(' ')[0];
            setUserFullName(firstName);
          }

          // Fetch pre-assigned modules just to establish setup
          const { data: assigned } = await supabase
            .from('user_modules')
            .select('module_id')
            .eq('user_id', user.id);

          if (assigned && assigned.length > 0) {
            setSelectedModuleId(assigned[0].module_id);
          }
        }
      } catch (err) {
        console.error('Error fetching user data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchInitialData();
  }, []);

  useEffect(() => {
    const fetchModules = async () => {
      try {
        const { data, error } = await supabase
          .from('coa_modules')
          .select('*')
          .eq('category', profileType)
          .eq('is_core', false); // Exclude core template module

        if (error) throw error;
        setModules(data || []);
      } catch (err) {
        console.error('Error fetching modules:', err);
      }
    };

    fetchModules();
  }, [profileType]);

  const handleModuleSelect = (moduleId) => {
    setSelectedModuleId(moduleId);
  };

  const handleContinueSetup = async () => {
    if (!selectedModuleId) return;

    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("User session expired");

      // 1. Get the Core Module ID
      const { data: coreModule } = await supabase
        .from('coa_modules')
        .select('module_id')
        .eq('module_name', 'Core')
        .single();

      const idsToFetch = [selectedModuleId];
      if (coreModule && coreModule.module_id !== selectedModuleId) {
        idsToFetch.push(coreModule.module_id);
      }

      // 2. Fetch Templates
      const { data: templates, error: fetchError } = await supabase
        .from('coa_templates')
        .select('*')
        .in('module_id', idsToFetch);

      if (fetchError) throw fetchError;

      // 3. Separate Parents and Children
      const parents = templates.filter(t => !t.parent_template_id);
      const children = templates.filter(t => t.parent_template_id);

      // 4. Insert Parents inside Accounts
      const parentInserts = parents.map(p => ({
        user_id: user.id,
        account_name: p.account_name,
        account_type: p.account_type,
        balance_nature: p.balance_nature,
        is_system_generated: p.is_system_generated,
        template_id: p.template_id
      }));

      const { data: insertedParents, error: parentError } = await supabase
        .from('accounts')
        .insert(parentInserts)
        .select('account_id, template_id');

      if (parentError) throw parentError;

      // 5. Map parent old template_id to new account_id
      const parentMap = {};
      insertedParents.forEach(p => {
        if (p.template_id) {
          parentMap[p.template_id] = p.account_id;
        }
      });

      // 6. Insert Children mapping parent_account_id
      const childInserts = children.map(c => ({
        user_id: user.id,
        account_name: c.account_name,
        account_type: c.account_type,
        balance_nature: c.balance_nature,
        is_system_generated: c.is_system_generated,
        template_id: c.template_id,
        parent_account_id: parentMap[c.parent_template_id] || null
      }));

      if (childInserts.length > 0) {
        const { error: childError } = await supabase
          .from('accounts')
          .insert(childInserts);
          
        if (childError) throw childError;
      }

      // 7. Insert into user_modules to mark setup completion
      const moduleInserts = idsToFetch.map(id => ({
        user_id: user.id,
        module_id: id
      }));

      const { error: userModuleError } = await supabase
        .from('user_modules')
        .insert(moduleInserts);

      if (userModuleError) throw userModuleError;

      if (onSetupComplete) onSetupComplete();

    } catch (err) {
      console.error('Setup failed:', err);
      alert('Setup failed: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="welcome-container loading">
        <span className="spinner"></span>
      </div>
    );
  }

  return (
    <div className="welcome-container">
      <button className="theme-toggle" onClick={toggleTheme} aria-label="Toggle Theme">
        {isDarkMode ? '☀️' : '🌙'}
      </button>
      <div className="welcome-content">
        <div className="welcome-header">
          <h1>Welcome, <span className="name-highlight">{userFullName}!</span></h1>
          <p className="description">Help us kickstart your profile by telling us a bit about who you are.</p>
        </div>

        {/* Section 1: Category Selector */}
        <div className="setup-section">
          <label className="section-label">1. What type of profile are you setting up?</label>
          <div className="category-toggle-grid">
            <button
              className={`category-btn ${profileType === 'INDIVIDUAL' ? 'selected' : ''}`}
              onClick={() => { setProfileType('INDIVIDUAL'); setSelectedModuleId(null); }}
            >
              <div className="category-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
              </div>
              <span>Individual</span>
            </button>
            <button
              className={`category-btn ${profileType === 'BUSINESS' ? 'selected' : ''}`}
              onClick={() => { setProfileType('BUSINESS'); setSelectedModuleId(null); }}
            >
              <div className="category-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline></svg>
              </div>
              <span>Business</span>
            </button>
          </div>
        </div>

        {/* Section 2: Module Selector */}
        <div className="setup-section">
          <label className="section-label">2. Select the specific setup:</label>
          <div className="modules-grid">
            {modules.map((module) => (
              <button
                key={module.module_id}
                className={`module-card ${selectedModuleId === module.module_id ? 'selected' : ''}`}
                onClick={() => handleModuleSelect(module.module_id)}
              >
                <h3>{module.module_name}</h3>
                <p>{module.description}</p>
              </button>
            ))}
          </div>
        </div>

        <div className="footer-actions">
          <button
            className="continue-btn"
            disabled={!selectedModuleId}
            onClick={handleContinueSetup}
          >
            Continue Setup
          </button>
        </div>
      </div>
    </div>
  );
};

export default WelcomeScreen;
