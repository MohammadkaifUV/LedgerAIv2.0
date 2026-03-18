const supabase = require('../config/supabaseClient'); 

/**
 * deleteModule
 * Deletes global coa_module and its cascading templates safely bypassing RLS
 */
const deleteModule = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: 'Missing module id in request' });

    // 1. Delete associated templates first
    const { error: tmpError } = await supabase
      .from('coa_templates')
      .delete()
      .eq('module_id', id);

    if (tmpError) throw tmpError;

    // 2. Delete the module
    const { error: modError } = await supabase
      .from('coa_modules')
      .delete()
      .eq('module_id', id);

    if (modError) throw modError;

    return res.status(200).json({ success: true, message: 'Module and associated templates deleted successfully.' });

  } catch (err) {
    console.error('❌ deleteModule exception:', err);
    return res.status(500).json({ error: 'Internal server error executing deletion.' });
  }
};

module.exports = { deleteModule };
