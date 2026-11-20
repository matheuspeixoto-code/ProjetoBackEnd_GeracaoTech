const { Router } = require('express');
const controller = require('../controllers/categoryController');
const auth = require('../middleware/auth');
const wrap = require('../middleware/asyncHandler');

const router = Router();

// "/search" precisa vir antes de "/:id"
router.get('/search', wrap(controller.search));
router.get('/:id', wrap(controller.getById));
router.post('/', auth, wrap(controller.create));
router.put('/:id', auth, wrap(controller.update));
router.delete('/:id', auth, wrap(controller.remove));

module.exports = router;
