const { Router } = require('express');
const controller = require('../controllers/userController');
const auth = require('../middleware/auth');
const wrap = require('../middleware/asyncHandler');

const router = Router();

router.post('/token', wrap(controller.token));
router.post('/', wrap(controller.create));
router.get('/:id', wrap(controller.getById));
router.put('/:id', auth, wrap(controller.update));
router.delete('/:id', auth, wrap(controller.remove));

module.exports = router;
